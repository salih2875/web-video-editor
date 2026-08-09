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

interface PlaybackSnapshot {
  clips: Clip[];
  audioClips: AudioClip[];
  effects: Effect[];
  totalDuration: number;
  currentTime: number;
  isPlaying: boolean;
  loopPlayback: boolean;
}

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
  const [isBuffering, setIsBuffering] = useState(false);
  const clockRef = useRef({ timelineTime: 0, lastTimestamp: 0, lastUiUpdate: 0 });
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

  const handleVideoReady = useCallback((id: string) => {
    const snapshot = snapshotRef.current;
    const active = getTopTimelineItem(snapshot.currentTime, snapshot.clips);
    if (!active || active.id !== id) return;
    const video = videoRefs.current.get(id);
    if (!video) return;
    const desiredSeconds = (active.clipStart + snapshot.currentTime - active.timelineStart) / 1000;
    if (Math.abs(video.currentTime - desiredSeconds) > 0.05) {
      video.currentTime = Math.max(0, desiredSeconds);
    }
    renderTimeline(snapshot.currentTime);
    if (snapshot.isPlaying && video.paused) void video.play().catch(() => undefined);
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

  const syncMedia = useCallback((timelineTime: number, shouldPlay: boolean) => {
    const snapshot = snapshotRef.current;
    const activeVideo = getTopTimelineItem(timelineTime, snapshot.clips);
    const activeAudio = getTopAudibleTimelineItem(timelineTime, snapshot.audioClips);
    let videoReady = !activeVideo;

    snapshot.clips.forEach((clip) => {
      const video = videoRefs.current.get(clip.id);
      if (!video) return;
      const active = clip.id === activeVideo?.id;
      if (!active) {
        if (!video.paused) video.pause();
        return;
      }
      const desiredSeconds = (clip.clipStart + timelineTime - clip.timelineStart) / 1000;
      videoReady = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA
        && Math.abs(video.currentTime - desiredSeconds) > 0.1) {
        video.currentTime = Math.max(0, desiredSeconds);
      }
      if (shouldPlay && video.paused && videoReady) void video.play().catch(() => undefined);
      if (!shouldPlay && !video.paused) video.pause();
    });
    setIsBuffering(Boolean(activeVideo) && !videoReady);
    renderTimeline(timelineTime);

    snapshot.audioClips.forEach((clip) => {
      const audio = audioRefs.current.get(clip.id);
      if (!audio) return;
      const active = clip.id === activeAudio?.id;
      audio.dataset.active = String(active);
      if (!active) {
        if (!audio.paused) audio.pause();
        return;
      }
      const desiredSeconds = (clip.clipStart + timelineTime - clip.timelineStart) / 1000;
      const localTime = timelineTime - clip.timelineStart;
      const remaining = clip.timelineEnd - timelineTime;
      const fadeInGain = clip.fadeIn > 0 ? Math.min(1, localTime / clip.fadeIn) : 1;
      const fadeOutGain = clip.fadeOut > 0 ? Math.min(1, remaining / clip.fadeOut) : 1;
      audio.volume = Math.max(0, Math.min(1, clip.volume * fadeInGain * fadeOutGain));
      audio.muted = clip.muted;
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA
        && Math.abs(audio.currentTime - desiredSeconds) > 0.1) {
        audio.currentTime = Math.max(0, desiredSeconds);
      }
      if (shouldPlay && audio.paused) void audio.play().catch(() => undefined);
      if (!shouldPlay && !audio.paused) audio.pause();
    });
    return videoReady;
  }, [renderTimeline]);

  const playbackFrame = useCallback((timestamp: number) => {
    const snapshot = snapshotRef.current;
    if (!snapshot.isPlaying || snapshot.totalDuration <= 0) return;
    if (!clockRef.current.lastTimestamp) clockRef.current.lastTimestamp = timestamp;
    const elapsed = Math.min(100, timestamp - clockRef.current.lastTimestamp);
    clockRef.current.lastTimestamp = timestamp;

    const ready = syncMedia(clockRef.current.timelineTime, true);
    if (ready) clockRef.current.timelineTime += elapsed;
    if (clockRef.current.timelineTime >= snapshot.totalDuration) {
      clockRef.current.timelineTime = 0;
      clockRef.current.lastTimestamp = timestamp;
      syncMedia(0, snapshot.loopPlayback);
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
    syncMedia(seekTime, isPlaying);
    updatePlayback({
      isSeeking: false,
    });
  }, [currentTime, isPlaying, isSeeking, syncMedia, totalDuration, updatePlayback]);

  useEffect(() => {
    if (!isPlaying && !isSeeking) syncMedia(currentTime, false);
  }, [audioClips, clips, currentTime, effects, isPlaying, isSeeking, syncMedia]);

  const beginPlayback = useCallback(async () => {
    const media = [...videoRefs.current.values(), ...audioRefs.current.values()];
    await Promise.allSettled(media.map(async (element) => {
      if (!element.paused) return;
      const muted = element.muted;
      element.muted = true;
      try {
        await element.play();
        element.pause();
      } finally {
        element.muted = muted;
      }
    }));
    play();
  }, [play]);

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
      {isBuffering && <div className={styles.buffering}>Buffering next clip…</div>}
      {hasMedia && (
        <div className={styles.controls}>
          <button onClick={isPlaying ? pause : () => void beginPlayback()}>{isPlaying ? "Pause" : "Play"}</button>
          <button onClick={() => seek(0)}>Reset</button>
          <span>{(currentTime / 1000).toFixed(1)} / {(totalDuration / 1000).toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
};
