import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AudioClip,
  Clip,
  EditorContextType,
  EditorState,
  InternalEditorContextType,
  TimeRange,
} from "../types/editor";
import { loadProjectSnapshot, saveProjectSnapshot } from "../utils/projectStorage";
import { getTopTimelineItem } from "../utils/timelineMath";

const initialEditorState: EditorState = {
  videoFile: null,
  audioFile: null,
  videoSources: [],
  clips: [],
  audioClips: [],
  Effects: [],
  currentClip: null,
  selectedItem: null,
  videoElement: null,
  duration: 0,
  totalDuration: 0,
  currentTime: 0,
  isSeeking: false,
  isPlaying: false,
  selectedRange: null,
  isGeneratingThumbnails: false,
  isLoadingAudio: false,
  mediaError: null,
  projectName: "Untitled project",
  isDirty: false,
  canUndo: false,
  canRedo: false,
  snapEnabled: true,
  loopPlayback: true,
  timelineZoom: 1,
  timelineScrollPosition: 0,
  ffmpegStatus: "idle",
  trimStatus: "idle",
  trimProgress: 0,
  lastTrimmedUrl: null,
  trimError: null,
};

const EditorContext = createContext<InternalEditorContextType | undefined>(undefined);

const makeId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const getMediaDuration = (url: string, kind: "audio" | "video") =>
  new Promise<number>((resolve, reject) => {
    const media = document.createElement(kind);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = media.duration * 1000;
      media.removeAttribute("src");
      media.load();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error(`The ${kind} has no usable duration.`));
    };
    media.onerror = () => reject(new Error(`The selected ${kind} could not be decoded.`));
    media.src = url;
  });

const seekVideo = (video: HTMLVideoElement, time: number) =>
  new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    const failed = () => reject(new Error("Could not seek while creating thumbnails."));
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = time;
  });

const createThumbnails = async (
  videoSrc: string,
  rangeMs?: { start: number; end: number },
): Promise<HTMLCanvasElement> => {
  const frameCount = 8;
  const frameWidth = 120;
  const frameHeight = 68;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = videoSrc;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not decode video thumbnails."));
  });

  const sourceStart = Math.max(0, (rangeMs?.start ?? 0) / 1000);
  const sourceEnd = Math.min(video.duration, (rangeMs?.end ?? video.duration * 1000) / 1000);
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth * frameCount;
  canvas.height = frameHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable for video thumbnails.");
  context.fillStyle = "#090b10";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const sourceAspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  for (let index = 0; index < frameCount; index += 1) {
    const progress = (index + 0.5) / frameCount;
    await seekVideo(video, sourceStart + (sourceEnd - sourceStart) * progress);
    let width = frameWidth;
    let height = width / sourceAspect;
    if (height > frameHeight) {
      height = frameHeight;
      width = height * sourceAspect;
    }
    const x = index * frameWidth + (frameWidth - width) / 2;
    const y = (frameHeight - height) / 2;
    context.drawImage(video, x, y, width, height);
  }
  video.removeAttribute("src");
  video.load();
  return canvas;
};

const createAudioPeaks = async (file: File, peakCount = 180): Promise<number[]> => {
  try {
    const audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const samplesPerPeak = Math.max(1, Math.floor(channel.length / peakCount));
    const peaks = Array.from({ length: peakCount }, (_, peakIndex) => {
      const start = peakIndex * samplesPerPeak;
      const end = Math.min(channel.length, start + samplesPerPeak);
      let max = 0;
      for (let index = start; index < end; index += 1) {
        max = Math.max(max, Math.abs(channel[index]));
      }
      return max;
    });
    await audioContext.close();
    const maxPeak = Math.max(...peaks, 0.01);
    return peaks.map((peak) => peak / maxPeak);
  } catch {
    return Array.from({ length: peakCount }, (_, index) =>
      0.2 + Math.abs(Math.sin(index * 0.41)) * 0.35,
    );
  }
};

const getTotalDuration = (clips: Clip[], audioClips: AudioClip[]) =>
  Math.max(
    0,
    ...clips.map((clip) => clip.timelineEnd),
    ...audioClips.map((clip) => clip.timelineEnd),
  );

const findActiveClip = (time: number, clips: Clip[]): { clip: Clip | null } => {
  return { clip: getTopTimelineItem(time, clips) };
};

const findActiveAudioClip = (time: number, clips: AudioClip[]): AudioClip | null => {
  return getTopTimelineItem(time, clips);
};

interface HistorySnapshot {
  clips: Clip[];
  audioClips: AudioClip[];
  Effects: EditorState["Effects"];
  selectedItem: EditorState["selectedItem"];
}

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState(initialEditorState);
  const stateRef = useRef(state);
  const objectUrlsRef = useRef(new Set<string>());
  const historyRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  stateRef.current = state;

  const captureSnapshot = useCallback((source: EditorState): HistorySnapshot => ({
    clips: source.clips.map((clip) => ({ ...clip, transform: { ...clip.transform } })),
    audioClips: source.audioClips.map((clip) => ({ ...clip, peaks: [...clip.peaks] })),
    Effects: [...source.Effects],
    selectedItem: source.selectedItem ? { ...source.selectedItem } : null,
  }), []);

  const recordHistory = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-49), captureSnapshot(stateRef.current)];
    futureRef.current = [];
  }, [captureSnapshot]);

  const updateState = useCallback((patch: Partial<EditorState>) => {
    setState((previous) => {
      const next = { ...previous, ...patch };
      if (patch.clips || patch.audioClips) {
        next.totalDuration = getTotalDuration(next.clips, next.audioClips);
        next.currentTime = Math.min(next.currentTime, next.totalDuration);
      }
      return next;
    });
  }, []);

  const setVideoFile = useCallback(async (file: File | null) => {
    if (!file) {
      setState((previous) => {
        const videoUrls = new Set(previous.clips.map((clip) => clip.clipURL));
        const audioClips = previous.audioClips.filter((clip) => !clip.sourceVideoClipId);
        videoUrls.forEach((url) => {
          if (!audioClips.some((clip) => clip.clipURL === url)) URL.revokeObjectURL(url);
        });
        const next = { ...previous, videoFile: null, videoSources: [], clips: [], audioClips, currentClip: null };
        next.totalDuration = getTotalDuration(next.clips, next.audioClips);
        next.currentTime = Math.min(next.currentTime, next.totalDuration);
        return next;
      });
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    const videoClipId = makeId("video");
    updateState({ isGeneratingThumbnails: true, mediaError: null });
    try {
      const [clipDuration, thumbnail, peaks] = await Promise.all([
        getMediaDuration(url, "video"),
        createThumbnails(url),
        createAudioPeaks(file),
      ]);
      recordHistory();
      setState((previous) => {
        const timelineStart = previous.clips.reduce(
          (end, clip) => Math.max(end, clip.timelineEnd),
          0,
        );
        const clip: Clip = {
          id: videoClipId,
          name: file.name,
          zIndex: previous.clips.length,
          clipURL: url,
          clipStart: 0,
          clipEnd: clipDuration,
          clipDuration,
          sourceDuration: clipDuration,
          timelineStart,
          timelineEnd: timelineStart + clipDuration,
          thumbnail,
          effects: [],
          transform: { x: 0, y: 0, scale: 1, rotation: 0, fit: "contain" },
        };
        const clips = [...previous.clips, clip];
        const soundtrack: AudioClip = {
          id: makeId("audio"),
          name: `${file.name} · soundtrack`,
          zIndex: previous.audioClips.length,
          clipURL: url,
          clipStart: 0,
          clipEnd: clipDuration,
          clipDuration,
          sourceDuration: clipDuration,
          timelineStart,
          timelineEnd: timelineStart + clipDuration,
          peaks,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
          sourceVideoClipId: videoClipId,
        };
        const audioClips = [...previous.audioClips, soundtrack];
        return {
          ...previous,
          videoFile: file,
          videoSources: [...previous.videoSources, url],
          clips,
          audioClips,
          currentClip: previous.currentClip ?? clip,
          duration: clipDuration,
          totalDuration: getTotalDuration(clips, audioClips),
          isGeneratingThumbnails: false,
          selectedItem: { type: "video", id: clip.id },
          isDirty: true,
          canUndo: true,
        };
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      updateState({
        isGeneratingThumbnails: false,
        mediaError: error instanceof Error ? error.message : String(error),
      });
    }
  }, [recordHistory, updateState]);

  const setAudioFile = useCallback(async (file: File | null) => {
    if (!file) {
      setState((previous) => {
        const removed = previous.audioClips.filter((clip) => !clip.sourceVideoClipId);
        const audioClips = previous.audioClips.filter((clip) => clip.sourceVideoClipId);
        new Set(removed.map((clip) => clip.clipURL)).forEach((url) => {
          if (!audioClips.some((clip) => clip.clipURL === url)
            && !previous.clips.some((clip) => clip.clipURL === url)) {
            URL.revokeObjectURL(url);
          }
        });
        const next = { ...previous, audioFile: null, audioClips };
        next.totalDuration = getTotalDuration(next.clips, next.audioClips);
        next.currentTime = Math.min(next.currentTime, next.totalDuration);
        return next;
      });
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    updateState({ isLoadingAudio: true, mediaError: null });
    try {
      const [clipDuration, peaks] = await Promise.all([
        getMediaDuration(url, "audio"),
        createAudioPeaks(file),
      ]);
      recordHistory();
      setState((previous) => {
        const timelineStart = previous.audioClips.reduce(
          (end, clip) => Math.max(end, clip.timelineEnd),
          0,
        );
        const clip: AudioClip = {
          id: makeId("audio"),
          name: file.name,
          zIndex: previous.audioClips.length,
          clipURL: url,
          clipStart: 0,
          clipEnd: clipDuration,
          clipDuration,
          sourceDuration: clipDuration,
          timelineStart,
          timelineEnd: timelineStart + clipDuration,
          peaks,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        };
        const audioClips = [...previous.audioClips, clip];
        return {
          ...previous,
          audioFile: file,
          audioClips,
          totalDuration: getTotalDuration(previous.clips, audioClips),
          isLoadingAudio: false,
          selectedItem: { type: "audio", id: clip.id },
          isDirty: true,
          canUndo: true,
        };
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      updateState({
        isLoadingAudio: false,
        mediaError: error instanceof Error ? error.message : String(error),
      });
    }
  }, [recordHistory, updateState]);

  useEffect(() => () => {
    const current = stateRef.current;
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    if (current.lastTrimmedUrl) URL.revokeObjectURL(current.lastTrimmedUrl);
  }, []);

  const seek = useCallback((time: number) => {
    const total = stateRef.current.totalDuration;
    updateState({ currentTime: Math.max(0, Math.min(time, total)), isSeeking: true });
  }, [updateState]);

  const removeVideoClip = useCallback((id: string) => {
    recordHistory();
    setState((previous) => {
      const removed = previous.clips.find((clip) => clip.id === id);
      if (!removed) return previous;
      const clips = previous.clips.filter((clip) => clip.id !== id);
      const totalDuration = getTotalDuration(clips, previous.audioClips);
      const currentTime = Math.min(previous.currentTime, totalDuration);
      return {
        ...previous,
        clips,
        videoFile: clips.length ? previous.videoFile : null,
        videoSources: previous.videoSources.filter((url) =>
          clips.some((clip) => clip.clipURL === url),
        ),
        totalDuration,
        currentTime,
        currentClip: findActiveClip(currentTime, clips).clip,
        isPlaying: totalDuration > 0 && previous.isPlaying,
        isSeeking: true,
        selectedItem: previous.selectedItem?.id === id ? null : previous.selectedItem,
        isDirty: true,
        canUndo: true,
        canRedo: false,
      };
    });
  }, [recordHistory]);

  const removeAudioClip = useCallback((id: string) => {
    recordHistory();
    setState((previous) => {
      const removed = previous.audioClips.find((clip) => clip.id === id);
      if (!removed) return previous;
      const audioClips = previous.audioClips.filter((clip) => clip.id !== id);
      const totalDuration = getTotalDuration(previous.clips, audioClips);
      return {
        ...previous,
        audioClips,
        audioFile: audioClips.some((clip) => !clip.sourceVideoClipId)
          ? previous.audioFile
          : null,
        totalDuration,
        currentTime: Math.min(previous.currentTime, totalDuration),
        isPlaying: totalDuration > 0 && previous.isPlaying,
        isSeeking: true,
        selectedItem: previous.selectedItem?.id === id ? null : previous.selectedItem,
        isDirty: true,
        canUndo: true,
        canRedo: false,
      };
    });
  }, [recordHistory]);

  const updateVideoClip = useCallback((id: string, patch: Partial<Clip>) => {
    recordHistory();
    setState((previous) => {
      const original = previous.clips.find((clip) => clip.id === id);
      if (!original) return previous;
      const clips = previous.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip);
      const updated = clips.find((clip) => clip.id === id)!;
      const timingChanged = patch.timelineStart !== undefined
        || patch.timelineEnd !== undefined
        || patch.clipStart !== undefined
        || patch.clipEnd !== undefined
        || patch.clipDuration !== undefined;
      const audioClips = timingChanged
        ? previous.audioClips.map((audio) => audio.sourceVideoClipId === id ? {
            ...audio,
            timelineStart: updated.timelineStart,
            timelineEnd: updated.timelineEnd,
            clipStart: updated.clipStart,
            clipEnd: updated.clipEnd,
            clipDuration: updated.clipDuration,
          } : audio)
        : previous.audioClips;
      return {
        ...previous,
        clips,
        audioClips,
        totalDuration: getTotalDuration(clips, audioClips),
        currentClip: previous.currentClip?.id === id
          ? clips.find((clip) => clip.id === id) ?? null
          : previous.currentClip,
        isDirty: true,
        canUndo: true,
        canRedo: false,
      };
    });
  }, [recordHistory]);

  const updateAudioClip = useCallback((id: string, patch: Partial<AudioClip>) => {
    recordHistory();
    setState((previous) => {
      const audioClips = previous.audioClips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip);
      return {
        ...previous,
        audioClips,
        totalDuration: getTotalDuration(previous.clips, audioClips),
        isDirty: true,
        canUndo: true,
        canRedo: false,
      };
    });
  }, [recordHistory]);

  const bringToFront = useCallback((selection: EditorState["selectedItem"]) => {
    if (!selection) return;
    if (selection.type === "video") {
      const nextZ = Math.max(0, ...stateRef.current.clips.map((clip) => clip.zIndex)) + 1;
      updateVideoClip(selection.id, { zIndex: nextZ });
    } else {
      const nextZ = Math.max(0, ...stateRef.current.audioClips.map((clip) => clip.zIndex)) + 1;
      updateAudioClip(selection.id, { zIndex: nextZ });
    }
  }, [updateAudioClip, updateVideoClip]);

  const duplicateSelected = useCallback(() => {
    const current = stateRef.current;
    const selection = current.selectedItem;
    if (!selection) return;
    recordHistory();
    if (selection.type === "video") {
      const source = current.clips.find((clip) => clip.id === selection.id);
      if (!source) return;
      const id = makeId("video");
      const offset = 250;
      const duplicate: Clip = {
        ...source,
        id,
        name: `${source.name} copy`,
        timelineStart: source.timelineStart + offset,
        timelineEnd: source.timelineEnd + offset,
        zIndex: Math.max(0, ...current.clips.map((clip) => clip.zIndex)) + 1,
        transform: { ...source.transform },
      };
      const linked = current.audioClips
        .filter((audio) => audio.sourceVideoClipId === source.id)
        .map((audio) => ({
          ...audio,
          id: makeId("audio"),
          sourceVideoClipId: id,
          name: `${audio.name} copy`,
          timelineStart: audio.timelineStart + offset,
          timelineEnd: audio.timelineEnd + offset,
          zIndex: Math.max(0, ...current.audioClips.map((clip) => clip.zIndex)) + 1,
          peaks: [...audio.peaks],
        }));
      updateState({
        clips: [...current.clips, duplicate],
        audioClips: [...current.audioClips, ...linked],
        selectedItem: { type: "video", id },
        isDirty: true,
        canUndo: true,
        canRedo: false,
      });
    } else {
      const source = current.audioClips.find((clip) => clip.id === selection.id);
      if (!source) return;
      const duplicate: AudioClip = {
        ...source,
        id: makeId("audio"),
        name: `${source.name} copy`,
        timelineStart: source.timelineStart + 250,
        timelineEnd: source.timelineEnd + 250,
        zIndex: Math.max(0, ...current.audioClips.map((clip) => clip.zIndex)) + 1,
        sourceVideoClipId: undefined,
        peaks: [...source.peaks],
      };
      updateState({
        audioClips: [...current.audioClips, duplicate],
        selectedItem: { type: "audio", id: duplicate.id },
        isDirty: true,
        canUndo: true,
        canRedo: false,
      });
    }
  }, [recordHistory, updateState]);

  const splitAudioClip = useCallback(() => {
    const current = stateRef.current;
    const selected = current.selectedItem?.type === "audio"
      ? current.audioClips.find((clip) => clip.id === current.selectedItem?.id) ?? null
      : findActiveAudioClip(current.currentTime, current.audioClips);
    if (!selected) return;
    const offset = current.currentTime - selected.timelineStart;
    if (offset < 50 || offset > selected.clipDuration - 50) return;
    recordHistory();
    const peakIndex = Math.max(1, Math.round(selected.peaks.length * offset / selected.clipDuration));
    const first: AudioClip = {
      ...selected,
      id: makeId("audio"),
      clipEnd: selected.clipStart + offset,
      clipDuration: offset,
      timelineEnd: current.currentTime,
      peaks: selected.peaks.slice(0, peakIndex),
    };
    const second: AudioClip = {
      ...selected,
      id: makeId("audio"),
      clipStart: selected.clipStart + offset,
      clipDuration: selected.clipDuration - offset,
      timelineStart: current.currentTime,
      peaks: selected.peaks.slice(peakIndex),
    };
    updateState({
      audioClips: current.audioClips.flatMap((clip) => clip.id === selected.id ? [first, second] : [clip]),
      selectedItem: { type: "audio", id: second.id },
      isDirty: true,
      canUndo: true,
      canRedo: false,
    });
  }, [recordHistory, updateState]);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return;
    futureRef.current.push(captureSnapshot(stateRef.current));
    setState((previous) => ({
      ...previous,
      ...snapshot,
      totalDuration: getTotalDuration(snapshot.clips, snapshot.audioClips),
      currentClip: findActiveClip(previous.currentTime, snapshot.clips).clip,
      canUndo: historyRef.current.length > 0,
      canRedo: true,
      isDirty: true,
      isSeeking: true,
    }));
  }, [captureSnapshot]);

  const redo = useCallback(() => {
    const snapshot = futureRef.current.pop();
    if (!snapshot) return;
    historyRef.current.push(captureSnapshot(stateRef.current));
    setState((previous) => ({
      ...previous,
      ...snapshot,
      totalDuration: getTotalDuration(snapshot.clips, snapshot.audioClips),
      currentClip: findActiveClip(previous.currentTime, snapshot.clips).clip,
      canUndo: true,
      canRedo: futureRef.current.length > 0,
      isDirty: true,
      isSeeking: true,
    }));
  }, [captureSnapshot]);

  const splitClip = useCallback(async () => {
    const current = stateRef.current;
    const clip = findActiveClip(current.currentTime, current.clips).clip;
    if (!clip) return;
    const offset = current.currentTime - clip.timelineStart;
    if (offset < 50 || offset > clip.clipDuration - 50) return;
    recordHistory();
    const sourceSplit = clip.clipStart + offset;
    updateState({ isGeneratingThumbnails: true });
    try {
      const [firstThumbnail, secondThumbnail] = await Promise.all([
        createThumbnails(clip.clipURL, { start: clip.clipStart, end: sourceSplit }),
        createThumbnails(clip.clipURL, { start: sourceSplit, end: clip.clipEnd }),
      ]);
      const first: Clip = {
        ...clip,
        id: makeId("video"),
        clipEnd: sourceSplit,
        clipDuration: offset,
        timelineEnd: current.currentTime,
        thumbnail: firstThumbnail,
      };
      const second: Clip = {
        ...clip,
        id: makeId("video"),
        clipStart: sourceSplit,
        clipDuration: clip.clipDuration - offset,
        timelineStart: current.currentTime,
        thumbnail: secondThumbnail,
      };
      const linkedAudio = current.audioClips.filter(
        (audio) => audio.sourceVideoClipId === clip.id,
      );
      const splitAudio = linkedAudio.flatMap((audio) => {
        const peakIndex = Math.max(1, Math.round(audio.peaks.length * (offset / clip.clipDuration)));
        return [
          {
            ...audio,
            id: makeId("audio"),
            sourceVideoClipId: first.id,
            clipEnd: audio.clipStart + offset,
            clipDuration: offset,
            timelineEnd: current.currentTime,
            peaks: audio.peaks.slice(0, peakIndex),
          },
          {
            ...audio,
            id: makeId("audio"),
            sourceVideoClipId: second.id,
            clipStart: audio.clipStart + offset,
            clipDuration: audio.clipDuration - offset,
            timelineStart: current.currentTime,
            peaks: audio.peaks.slice(peakIndex),
          },
        ];
      });
      updateState({
        clips: current.clips.flatMap((item) => item.id === clip.id ? [first, second] : [item]),
        audioClips: current.audioClips.flatMap((audio) =>
          audio.sourceVideoClipId === clip.id ? [] : [audio],
        ).concat(splitAudio),
        currentClip: second,
        isGeneratingThumbnails: false,
      });
    } catch (error) {
      updateState({
        isGeneratingThumbnails: false,
        mediaError: error instanceof Error ? error.message : String(error),
      });
    }
  }, [recordHistory, updateState]);

  const deleteSelected = useCallback(() => {
    const selection = stateRef.current.selectedItem;
    if (!selection) return;
    if (selection.type === "video") removeVideoClip(selection.id);
    else removeAudioClip(selection.id);
  }, [removeAudioClip, removeVideoClip]);

  const saveProject = useCallback(async () => {
    try {
      await saveProjectSnapshot(stateRef.current);
      updateState({ isDirty: false, mediaError: null });
    } catch (error) {
      updateState({ mediaError: error instanceof Error ? error.message : String(error) });
    }
  }, [updateState]);

  const loadAutosave = useCallback(async () => {
    try {
      const restored = await loadProjectSnapshot();
      if (!restored || stateRef.current.clips.length || stateRef.current.audioClips.length) return;
      [...restored.clips, ...restored.audioClips].forEach((clip) => objectUrlsRef.current.add(clip.clipURL));
      setState((previous) => ({
        ...previous,
        projectName: restored.name,
        clips: restored.clips,
        audioClips: restored.audioClips,
        videoSources: [...new Set(restored.clips.map((clip) => clip.clipURL))],
        totalDuration: getTotalDuration(restored.clips, restored.audioClips),
        currentClip: findActiveClip(0, restored.clips).clip,
        currentTime: 0,
        isSeeking: true,
        isDirty: false,
      }));
    } catch (error) {
      updateState({ mediaError: error instanceof Error ? error.message : String(error) });
    }
  }, [updateState]);

  useEffect(() => {
    void loadAutosave();
  }, [loadAutosave]);

  useEffect(() => {
    if (!state.isDirty) return;
    const timeout = window.setTimeout(() => void saveProject(), 1800);
    return () => window.clearTimeout(timeout);
  }, [state.audioClips, state.clips, state.Effects, state.isDirty, state.projectName, saveProject]);

  useEffect(() => {
    const warnIfDirty = (event: BeforeUnloadEvent) => {
      if (!stateRef.current.isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnIfDirty);
    return () => window.removeEventListener("beforeunload", warnIfDirty);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === " ") {
        event.preventDefault();
        updateState({ isPlaying: !stateRef.current.isPlaying });
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (stateRef.current.selectedItem?.type === "audio") splitAudioClip();
        else void splitClip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, duplicateSelected, redo, saveProject, splitAudioClip, splitClip, undo, updateState]);

  const loadFFmpeg = useCallback(async () => {
    updateState({ ffmpegStatus: "loading", trimError: null });
    try {
      const { getFFmpeg } = await import("../utils/ffmpegService");
      await getFFmpeg();
      updateState({ ffmpegStatus: "loaded" });
    } catch (error) {
      updateState({ ffmpegStatus: "error", trimError: error instanceof Error ? error.message : String(error) });
    }
  }, [updateState]);

  const trimVideo = useCallback(async () => {
    const current = stateRef.current;
    if (!current.videoFile || !current.selectedRange) return;
    updateState({ trimStatus: "trimming", trimProgress: 0, trimError: null });
    try {
      const { runTrim } = await import("../utils/ffmpegService");
      const result = await runTrim({
        inputFile: current.videoFile,
        startTime: current.selectedRange.start / 1000,
        endTime: current.selectedRange.end / 1000,
        onProgress: (trimProgress) => updateState({ trimProgress }),
      });
      if (stateRef.current.lastTrimmedUrl) URL.revokeObjectURL(stateRef.current.lastTrimmedUrl);
      updateState({ trimStatus: "done", trimProgress: 1, lastTrimmedUrl: result });
    } catch (error) {
      updateState({ trimStatus: "error", trimError: error instanceof Error ? error.message : String(error) });
    }
  }, [updateState]);

  const setTimelineZoom = useCallback((zoom: number) =>
    updateState({ timelineZoom: Math.max(0.25, Math.min(8, zoom)) }), [updateState]);

  const value = useMemo<InternalEditorContextType>(() => ({
    ...state,
    _updateState: updateState,
    setVideoFile,
    setAudioFile,
    removeVideoClip,
    removeAudioClip,
    selectItem: (selectedItem) => updateState({
      selectedItem,
      currentClip: selectedItem?.type === "video"
        ? state.clips.find((clip) => clip.id === selectedItem.id) ?? null
        : state.currentClip,
    }),
    updateVideoClip,
    updateAudioClip,
    bringToFront,
    duplicateSelected,
    deleteSelected,
    splitAudioClip,
    undo,
    redo,
    saveProject,
    loadAutosave,
    setSnapEnabled: (snapEnabled) => updateState({ snapEnabled }),
    setLoopPlayback: (loopPlayback) => updateState({ loopPlayback }),
    setVideoElement: (videoElement) => updateState({ videoElement }),
    play: () => state.totalDuration > 0 && updateState({ isPlaying: true }),
    pause: () => updateState({ isPlaying: false }),
    seek,
    setSelectedRange: (range: TimeRange | null) => {
      if (!range) return updateState({ selectedRange: null });
      updateState({ selectedRange: {
        start: Math.max(0, Math.min(range.start, state.totalDuration)),
        end: Math.max(range.start, Math.min(range.end, state.totalDuration)),
      } });
    },
    splitClip,
    setTimelineZoom,
    setTimelineScrollPosition: (position) => updateState({ timelineScrollPosition: Math.max(0, position) }),
    zoomIn: () => setTimelineZoom(state.timelineZoom * 1.25),
    zoomOut: () => setTimelineZoom(state.timelineZoom / 1.25),
    resetZoom: () => updateState({ timelineZoom: 1, timelineScrollPosition: 0 }),
    zoomToFit: () => updateState({ timelineZoom: 1, timelineScrollPosition: 0 }),
    loadFFmpeg,
    trimVideo,
    clearTrimmedVideo: () => {
      if (state.lastTrimmedUrl) URL.revokeObjectURL(state.lastTrimmedUrl);
      updateState({ lastTrimmedUrl: null, trimStatus: "idle" });
    },
    findActiveClip,
    findActiveClips: (start, end, clips) => ({
      clips: clips.filter((clip) => clip.timelineStart < end && clip.timelineEnd > start),
    }),
  }), [state, updateState, setVideoFile, setAudioFile, removeVideoClip, removeAudioClip, updateVideoClip, updateAudioClip, bringToFront, duplicateSelected, deleteSelected, splitAudioClip, undo, redo, saveProject, loadAutosave, seek, splitClip, setTimelineZoom, loadFFmpeg, trimVideo]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEditor = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (!context) throw new Error("useEditor must be used within an EditorProvider");
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEditorInternals = (): InternalEditorContextType => {
  const context = useContext(EditorContext);
  if (!context) throw new Error("useEditorInternals must be used within an EditorProvider");
  return context;
};
