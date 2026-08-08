import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Application, Filter, Sprite, Texture } from "pixi.js";
import { useEditor, useEditorInternals } from "../../context/EditorContext";
import type { AudioClip, Clip, Effect } from "../../types/editor";
import styles from "./VideoPlayer.module.css";
import { getTopTimelineItem } from "../../utils/timelineMath";

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
  return <audio ref={setRef} src={clip.clipURL} preload="auto" data-clip-id={clip.id} data-name={clip.name} data-z-index={clip.zIndex} data-timeline-start={clip.timelineStart} />;
});

export const VideoPlayer: React.FC = () => {
  const {
    clips,
    audioClips,
    Effects,
    totalDuration,
    currentTime,
    isPlaying,
    isSeeking,
    loopPlayback,
    play,
    pause,
    seek,
  } = useEditor();
  const { _updateState, findActiveClip } = useEditorInternals();
  const pixiHostRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const textureRefs = useRef(new Map<string, Texture>());
  const spriteRefs = useRef(new Map<string, Sprite>());
  const appRef = useRef<Application | null>(null);
  const visibleClipIdRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const clockRef = useRef({ timelineTime: 0, lastTimestamp: 0, lastUiUpdate: 0 });
  const snapshotRef = useRef<PlaybackSnapshot>({
    clips,
    audioClips,
    effects: Effects,
    totalDuration,
    currentTime,
    isPlaying,
    loopPlayback,
  });
  snapshotRef.current = {
    clips,
    audioClips,
    effects: Effects,
    totalDuration,
    currentTime,
    isPlaying,
    loopPlayback,
  };

  const registerVideo = useCallback((id: string, element: HTMLVideoElement | null) => {
    if (element) {
      videoRefs.current.set(id, element);
      return;
    }
    videoRefs.current.delete(id);
    spriteRefs.current.delete(id);
    const texture = textureRefs.current.get(id);
    if (texture) texture.destroy(true);
    textureRefs.current.delete(id);
  }, []);

  const registerAudio = useCallback((id: string, element: HTMLAudioElement | null) => {
    if (element) audioRefs.current.set(id, element);
    else audioRefs.current.delete(id);
  }, []);

  const renderVideo = useCallback((clip: Clip | null) => {
    const app = appRef.current;
    if (!app) return;
    if (!clip) {
      visibleClipIdRef.current = null;
      app.stage.removeChildren();
      app.renderer.render(app.stage);
      return;
    }

    const video = videoRefs.current.get(clip.id);
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return; // Keep the previous rendered frame visible while the next clip buffers.
    }
    let texture = textureRefs.current.get(clip.id);
    let sprite = spriteRefs.current.get(clip.id);
    if (!texture || !sprite) {
      texture = Texture.from(video);
      sprite = new Sprite(texture);
      textureRefs.current.set(clip.id, texture);
      spriteRefs.current.set(clip.id, sprite);
    }
    texture.baseTexture.update();
    const scaleMethod = clip.transform.fit === "cover" ? Math.max : Math.min;
    const scale = scaleMethod(
      app.screen.width / Math.max(1, video.videoWidth),
      app.screen.height / Math.max(1, video.videoHeight),
    ) * clip.transform.scale;
    sprite.anchor.set(0.5);
    sprite.width = video.videoWidth * scale;
    sprite.height = video.videoHeight * scale;
    sprite.x = app.screen.width / 2 + clip.transform.x;
    sprite.y = app.screen.height / 2 + clip.transform.y;
    sprite.rotation = clip.transform.rotation * Math.PI / 180;
    sprite.filters = snapshotRef.current.effects
      .filter((effect) => effect.id === clip.id)
      .map((effect) => effect.filter as Filter<Record<string, unknown>>);
    if (visibleClipIdRef.current !== clip.id) {
      app.stage.removeChildren();
      app.stage.addChild(sprite);
      visibleClipIdRef.current = clip.id;
    }
    app.renderer.render(app.stage);
  }, []);

  const handleVideoReady = useCallback((id: string) => {
    const snapshot = snapshotRef.current;
    const active = findActiveClip(snapshot.currentTime, snapshot.clips).clip;
    if (!active || active.id !== id) return;
    const video = videoRefs.current.get(id);
    if (!video) return;
    const desiredSeconds = (active.clipStart + snapshot.currentTime - active.timelineStart) / 1000;
    if (Math.abs(video.currentTime - desiredSeconds) > 0.05) {
      video.currentTime = Math.max(0, desiredSeconds);
    }
    renderVideo(active);
    if (snapshot.isPlaying && video.paused) void video.play().catch(() => undefined);
  }, [findActiveClip, renderVideo]);

  useEffect(() => {
    const host = pixiHostRef.current;
    if (!host) return;
    const textures = textureRefs.current;
    const sprites = spriteRefs.current;
    const app = new Application({
      width: 1280,
      height: 720,
      backgroundColor: 0x000000,
      antialias: true,
      autoStart: false,
      preserveDrawingBuffer: true,
    });
    const canvas = app.view as HTMLCanvasElement;
    canvas.className = styles.canvas;
    host.appendChild(canvas);
    appRef.current = app;
    return () => {
      textures.forEach((texture) => texture.destroy(true));
      textures.clear();
      sprites.clear();
      app.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  const syncMedia = useCallback((timelineTime: number, shouldPlay: boolean) => {
    const snapshot = snapshotRef.current;
    const activeVideo = findActiveClip(timelineTime, snapshot.clips).clip;
    const activeAudio = getTopTimelineItem(timelineTime, snapshot.audioClips);
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
    if (activeVideo) renderVideo(activeVideo);
    else renderVideo(null);

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
  }, [findActiveClip, renderVideo]);

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
      _updateState({
        currentTime: 0,
        currentClip: findActiveClip(0, snapshot.clips).clip,
        isSeeking: false,
        isPlaying: snapshot.loopPlayback,
      });
      if (!snapshot.loopPlayback) return;
    } else if (timestamp - clockRef.current.lastUiUpdate >= 32) {
      clockRef.current.lastUiUpdate = timestamp;
      const nextTime = clockRef.current.timelineTime;
      _updateState({
        currentTime: nextTime,
        currentClip: findActiveClip(nextTime, snapshot.clips).clip,
      });
    }
    frameRef.current = requestAnimationFrame(playbackFrame);
  }, [_updateState, findActiveClip, syncMedia]);

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
    _updateState({
      isSeeking: false,
      currentClip: findActiveClip(seekTime, clips).clip,
    });
  }, [clips, currentTime, findActiveClip, isPlaying, isSeeking, syncMedia, totalDuration, _updateState]);

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
