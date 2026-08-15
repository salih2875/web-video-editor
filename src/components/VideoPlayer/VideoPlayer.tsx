import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "../../context/EditorContext";
import type { AudioClip, Clip, Effect } from "../../types/editor";
import {
  PixiTimelineRenderer,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
} from "../../rendering/PixiTimelineRenderer";
import styles from "./VideoPlayer.module.css";
import {
  getTopAudibleTimelineItem,
  getTopTimelineItem,
} from "../../utils/timelineMath";
import { advancePlaybackTime } from "../../utils/playbackClock";

interface PlaybackSnapshot {
  clips: Clip[];
  audioClips: AudioClip[];
  effects: Effect[];
  totalDuration: number;
  currentTime: number;
  isPlaying: boolean;
  loopPlayback: boolean;
}

const PLAYBACK_DRIFT_TOLERANCE_SECONDS = 0.25;

const HiddenVideo = memo(({
  clip,
  register,
  mediaReady,
}: {
  clip: Clip;
  register: (id: string, element: HTMLVideoElement | null) => void;
  mediaReady: (id: string) => void;
}) => {
  const setRef = useCallback((element: HTMLVideoElement | null) =>
    register(clip.id, element), [clip.id, register]);
  return (
    <video
      ref={setRef}
      src={clip.clipURL}
      preload="auto"
      muted
      playsInline
      className={styles.videoElement}
      onLoadedData={() => mediaReady(clip.id)}
      onSeeked={() => mediaReady(clip.id)}
    />
  );
});

const HiddenAudio = memo(({
  clip,
  register,
}: {
  clip: AudioClip;
  register: (id: string, element: HTMLAudioElement | null) => void;
}) => {
  const setRef = useCallback((element: HTMLAudioElement | null) =>
    register(clip.id, element), [clip.id, register]);
  return <audio ref={setRef} src={clip.clipURL} preload="auto" />;
});

export const VideoPlayer: React.FC = () => {
  const {
    clips,
    audioClips,
    effects,
    totalDuration,
    currentTime,
    isPlaying,
    isSeeking,
    loopPlayback,
    play,
    pause,
    seek,
    updatePlayback,
  } = useEditor();
  const pixiHostRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const rendererRef = useRef<PixiTimelineRenderer | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeMediaRef = useRef<{ videoId: string | null; audioId: string | null }>({
    videoId: null,
    audioId: null,
  });
  const bufferingRef = useRef(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const pendingPlayRef = useRef(new WeakSet<HTMLMediaElement>());
  const clockRef = useRef({
    timelineTime: 0,
    lastTimestamp: 0,
    lastUiUpdate: 0,
    waitingForMedia: false,
  });
  const snapshotRef = useRef<PlaybackSnapshot>({
    clips,
    audioClips,
    effects,
    totalDuration,
    currentTime,
    isPlaying,
    loopPlayback,
  });
  snapshotRef.current = {
    clips,
    audioClips,
    effects,
    totalDuration,
    currentTime,
    isPlaying,
    loopPlayback,
  };

  const registerVideo = useCallback((id: string, element: HTMLVideoElement | null) => {
    if (element) {
      videoRefs.current.set(id, element);
      rendererRef.current?.registerVideo(id, element);
      return;
    }
    videoRefs.current.delete(id);
    rendererRef.current?.unregisterVideo(id);
  }, []);

  const registerAudio = useCallback((id: string, element: HTMLAudioElement | null) => {
    if (element) audioRefs.current.set(id, element);
    else audioRefs.current.delete(id);
  }, []);

  const renderTimeline = useCallback((timelineTime: number) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const snapshot = snapshotRef.current;
    renderer.renderTimelineFrame(timelineTime, snapshot.clips, snapshot.effects);
  }, []);

  useEffect(() => {
    const callbackIds = new Map<HTMLVideoElement, number>();
    const schedule = (id: string, video: HTMLVideoElement) => {
      if (!("requestVideoFrameCallback" in video)) return;
      const callbackId = video.requestVideoFrameCallback(() => {
        const snapshot = snapshotRef.current;
        const activeClip = getTopTimelineItem(clockRef.current.timelineTime, snapshot.clips);
        if (snapshot.isPlaying && activeClip?.id === id) {
          renderTimeline(clockRef.current.timelineTime);
        }
        schedule(id, video);
      });
      callbackIds.set(video, callbackId);
    };
    videoRefs.current.forEach((video, id) => schedule(id, video));
    return () => {
      callbackIds.forEach((callbackId, video) => {
        video.cancelVideoFrameCallback(callbackId);
      });
    };
  }, [clips, renderTimeline]);

  const handleVideoReady = useCallback((id: string) => {
    const snapshot = snapshotRef.current;
    const timelineTime = snapshot.isPlaying
      ? clockRef.current.timelineTime
      : snapshot.currentTime;
    const active = getTopTimelineItem(timelineTime, snapshot.clips);
    if (!active || active.id !== id) return;
    const video = videoRefs.current.get(id);
    if (!video) return;
    const desiredSeconds = (active.clipStart + timelineTime - active.timelineStart) / 1000;
    if (Math.abs(video.currentTime - desiredSeconds) > 0.05) {
      video.currentTime = Math.max(0, desiredSeconds);
    }
    renderTimeline(timelineTime);
  }, [renderTimeline]);

  useEffect(() => {
    const host = pixiHostRef.current;
    if (!host) return;
    const renderer = new PixiTimelineRenderer({
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
    });
    const { canvas } = renderer;
    canvas.className = styles.canvas;
    host.appendChild(canvas);
    rendererRef.current = renderer;
    videoRefs.current.forEach((video, id) => renderer.registerVideo(id, video));
    renderTimeline(snapshotRef.current.currentTime);
    return () => {
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [renderTimeline]);

  const requestMediaPlay = useCallback((element: HTMLMediaElement) => {
    if (!element.paused || pendingPlayRef.current.has(element)) return;
    pendingPlayRef.current.add(element);
    void element.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const reason = error instanceof Error ? error.message : String(error);
      setPlaybackError(`Playback could not start: ${reason}`);
      updatePlayback({ isPlaying: false });
    }).finally(() => {
      pendingPlayRef.current.delete(element);
    });
  }, [updatePlayback]);

  const syncMedia = useCallback((
    timelineTime: number,
    shouldPlay: boolean,
    forceSeek = false,
    userInitiated = false,
  ) => {
    const snapshot = snapshotRef.current;
    const activeVideo = getTopTimelineItem(timelineTime, snapshot.clips);
    const activeAudio = getTopAudibleTimelineItem(timelineTime, snapshot.audioClips);
    let videoReady = !activeVideo;
    let audioReady = !activeAudio;
    const activeVideoElement = activeVideo
      ? videoRefs.current.get(activeVideo.id) ?? null
      : null;
    const activeAudioElement = activeAudio
      ? audioRefs.current.get(activeAudio.id) ?? null
      : null;

    if (activeMediaRef.current.videoId !== (activeVideo?.id ?? null)) {
      const previousVideo = activeMediaRef.current.videoId
        ? videoRefs.current.get(activeMediaRef.current.videoId)
        : null;
      if (previousVideo && !previousVideo.paused) previousVideo.pause();
      activeMediaRef.current.videoId = activeVideo?.id ?? null;
    }
    if (activeVideo && activeVideoElement) {
      const desiredSeconds = (
        activeVideo.clipStart + timelineTime - activeVideo.timelineStart
      ) / 1000;
      const video = activeVideoElement;
      const drift = Math.abs(video.currentTime - desiredSeconds);
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA
        && drift > (forceSeek ? 0.01 : PLAYBACK_DRIFT_TOLERANCE_SECONDS)) {
        video.currentTime = Math.max(0, desiredSeconds);
      }
      videoReady = !video.seeking
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    }
    if (!shouldPlay
      || !activeVideoElement
      || !("requestVideoFrameCallback" in activeVideoElement)) {
      renderTimeline(timelineTime);
    }

    if (activeMediaRef.current.audioId !== (activeAudio?.id ?? null)) {
      const previousAudio = activeMediaRef.current.audioId
        ? audioRefs.current.get(activeMediaRef.current.audioId)
        : null;
      if (previousAudio) {
        previousAudio.dataset.active = "false";
        if (!previousAudio.paused) previousAudio.pause();
      }
      activeMediaRef.current.audioId = activeAudio?.id ?? null;
      if (activeAudioElement) activeAudioElement.dataset.active = "true";
    }
    if (activeAudio && activeAudioElement) {
      const desiredSeconds = (
        activeAudio.clipStart + timelineTime - activeAudio.timelineStart
      ) / 1000;
      const localTime = timelineTime - activeAudio.timelineStart;
      const remaining = activeAudio.timelineEnd - timelineTime;
      const fadeInGain = activeAudio.fadeIn > 0 ? Math.min(1, localTime / activeAudio.fadeIn) : 1;
      const fadeOutGain = activeAudio.fadeOut > 0 ? Math.min(1, remaining / activeAudio.fadeOut) : 1;
      const audio = activeAudioElement;
      audio.volume = Math.max(0, Math.min(
        1,
        activeAudio.volume * fadeInGain * fadeOutGain,
      ));
      audio.muted = activeAudio.muted;
      const drift = Math.abs(audio.currentTime - desiredSeconds);
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA
        && drift > (forceSeek ? 0.01 : PLAYBACK_DRIFT_TOLERANCE_SECONDS)) {
        audio.currentTime = Math.max(0, desiredSeconds);
      }
      audioReady = !audio.seeking
        && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    }

    const mediaReady = videoReady && audioReady;
    const isMediaBuffering = Boolean(activeVideo || activeAudio) && !mediaReady;
    if (bufferingRef.current !== isMediaBuffering) {
      bufferingRef.current = isMediaBuffering;
      setIsBuffering(isMediaBuffering);
    }

    if (!shouldPlay) {
      if (activeVideoElement && !activeVideoElement.paused) activeVideoElement.pause();
      if (activeAudioElement && !activeAudioElement.paused) activeAudioElement.pause();
      return mediaReady;
    }

    // Even if one side still needs to buffer, make both play requests during
    // the originating click so stricter browsers authorize audible playback.
    if (userInitiated) {
      if (activeVideoElement) requestMediaPlay(activeVideoElement);
      if (activeAudioElement) requestMediaPlay(activeAudioElement);
    }

    if (mediaReady) {
      if (activeVideoElement) requestMediaPlay(activeVideoElement);
      if (activeAudioElement) requestMediaPlay(activeAudioElement);
    } else {
      // Buffer an unready element, but pause its ready counterpart so the
      // soundtrack cannot run ahead while either side is stalled.
      if (activeVideoElement) {
        if (videoReady) activeVideoElement.pause();
        else requestMediaPlay(activeVideoElement);
      }
      if (activeAudioElement) {
        if (audioReady) activeAudioElement.pause();
        else requestMediaPlay(activeAudioElement);
      }
    }
    return mediaReady;
  }, [renderTimeline, requestMediaPlay]);

  const playbackFrame = useCallback((timestamp: number) => {
    const snapshot = snapshotRef.current;
    if (!snapshot.isPlaying || snapshot.totalDuration <= 0) return;
    if (!clockRef.current.lastTimestamp) clockRef.current.lastTimestamp = timestamp;
    clockRef.current.timelineTime = advancePlaybackTime(
      clockRef.current.timelineTime,
      clockRef.current.lastTimestamp,
      timestamp,
      clockRef.current.waitingForMedia,
    );
    clockRef.current.lastTimestamp = timestamp;

    // Media and performance.now() both continue across a slow frame. Keeping
    // the full elapsed time prevents the next sync from seeking media backward.
    // Once an actual media stall is detected, hold this clock until it is ready.
    const ready = syncMedia(clockRef.current.timelineTime, true);
    clockRef.current.waitingForMedia = !ready;
    if (clockRef.current.timelineTime >= snapshot.totalDuration) {
      clockRef.current.timelineTime = 0;
      clockRef.current.lastTimestamp = timestamp;
      clockRef.current.waitingForMedia = false;
      syncMedia(0, snapshot.loopPlayback, true);
      updatePlayback({
        currentTime: 0,
        isSeeking: false,
        isPlaying: snapshot.loopPlayback,
      });
      if (!snapshot.loopPlayback) return;
    } else if (timestamp - clockRef.current.lastUiUpdate >= 32) {
      clockRef.current.lastUiUpdate = timestamp;
      const nextTime = clockRef.current.timelineTime;
      updatePlayback({
        currentTime: nextTime,
      });
    }
    frameRef.current = requestAnimationFrame(playbackFrame);
  }, [syncMedia, updatePlayback]);

  useEffect(() => {
    const timelineTime = snapshotRef.current.currentTime >= totalDuration && totalDuration > 0
      ? 0
      : snapshotRef.current.currentTime;
    clockRef.current.timelineTime = timelineTime;
    clockRef.current.lastTimestamp = 0;
    clockRef.current.lastUiUpdate = 0;
    clockRef.current.waitingForMedia = false;
    if (isPlaying) frameRef.current = requestAnimationFrame(playbackFrame);
    else syncMedia(timelineTime, false);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [isPlaying, playbackFrame, syncMedia, totalDuration]);

  useEffect(() => {
    if (!isSeeking) return;
    const seekTime = totalDuration > 0 ? Math.min(currentTime, totalDuration) : 0;
    clockRef.current.timelineTime = seekTime;
    clockRef.current.lastTimestamp = 0;
    clockRef.current.waitingForMedia = false;
    syncMedia(seekTime, isPlaying, true);
    updatePlayback({
      isSeeking: false,
    });
  }, [currentTime, isPlaying, isSeeking, syncMedia, totalDuration, updatePlayback]);

  useEffect(() => {
    if (!isPlaying && !isSeeking) syncMedia(currentTime, false);
  }, [audioClips, clips, currentTime, effects, isPlaying, isSeeking, syncMedia]);

  const beginPlayback = useCallback(() => {
    const startTime = currentTime >= totalDuration && totalDuration > 0 ? 0 : currentTime;
    setPlaybackError(null);
    clockRef.current.timelineTime = startTime;
    clockRef.current.lastTimestamp = 0;
    clockRef.current.lastUiUpdate = 0;
    clockRef.current.waitingForMedia = false;

    // Start the audible element synchronously inside the click handler. Waiting
    // for a muted warm-up loses the browser's user-activation permission and can
    // make audio-only projects fail silently.
    syncMedia(startTime, true, true, true);
    if (startTime !== currentTime) seek(startTime);
    play();
  }, [currentTime, play, seek, syncMedia, totalDuration]);

  const hasMedia = clips.length > 0 || audioClips.length > 0;
  return (
    <div className={styles.playerContainer}>
      <div ref={pixiHostRef} className={styles.pixiHost} />
      {clips.map((clip) => (
        <HiddenVideo key={clip.id} clip={clip} register={registerVideo} mediaReady={handleVideoReady} />
      ))}
      {audioClips.map((clip) => (
        <HiddenAudio key={clip.id} clip={clip} register={registerAudio} />
      ))}
      {!clips.length && (
        <div className={styles.placeholder}>
          {audioClips.length ? "Audio-only project" : "Add video or audio to begin"}
        </div>
      )}
      {isBuffering && <div className={styles.buffering}>Buffering media…</div>}
      {playbackError && <div className={styles.playbackError}>{playbackError}</div>}
      {hasMedia && (
        <div className={styles.controls}>
          <button onClick={isPlaying ? pause : beginPlayback}>{isPlaying ? "Pause" : "Play"}</button>
          <button onClick={() => seek(0)}>Reset</button>
          <span>{(currentTime / 1000).toFixed(1)} / {(totalDuration / 1000).toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
};
