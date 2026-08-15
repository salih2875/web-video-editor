import {
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
  EffectName,
  MediaSelection,
} from "../types/editor";
import {
  loadProjectSnapshot,
  releaseCachedProjectAsset,
  saveProjectSnapshot,
} from "../utils/projectStorage";
import {
  createAudioPeaks,
  createAudioPeaksIfPresent,
  createVideoThumbnailStrip,
  getMediaDuration,
} from "../utils/mediaProcessing";
import { getTopTimelineItem } from "../utils/timelineMath";

const MAX_HISTORY_LENGTH = 50;
const MIN_SPLIT_DURATION_MS = 50;
const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0, fit: "contain" } as const;

const initialEditorState: EditorState = {
  clips: [],
  audioClips: [],
  effects: [],
  selectedItem: null,
  totalDuration: 0,
  currentTime: 0,
  isSeeking: false,
  isPlaying: false,
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
};

const EditorContext = createContext<EditorContextType | undefined>(undefined);
type EditorMediaActions = Pick<EditorContextType, "setVideoFile" | "setAudioFile">;
type EditorExportData = Pick<
  EditorContextType,
  "clips" | "audioClips" | "effects" | "totalDuration"
>;
type EditorPropertiesData = Pick<
  EditorContextType,
  | "clips"
  | "audioClips"
  | "selectedItem"
  | "updateVideoClip"
  | "updateAudioClip"
  | "bringToFront"
  | "duplicateSelected"
  | "deleteSelected"
  | "saveProject"
  | "setProjectName"
  | "projectName"
  | "isDirty"
  | "loopPlayback"
  | "setLoopPlayback"
  | "selectItem"
>;
const EditorMediaActionsContext = createContext<EditorMediaActions | undefined>(undefined);
const EditorExportDataContext = createContext<EditorExportData | undefined>(undefined);
const EditorPropertiesContext = createContext<EditorPropertiesData | undefined>(undefined);

const makeId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const hasChanges = <T extends object>(source: T, patch: Partial<T>) =>
  Object.entries(patch).some(([key, value]) => Reflect.get(source, key) !== value);

const getNextZIndex = (items: Array<{ zIndex: number }>) =>
  items.reduce((highest, item) => Math.max(highest, item.zIndex), -1) + 1;

const getTotalDuration = (clips: Clip[], audioClips: AudioClip[]) => {
  let duration = 0;
  for (const clip of clips) duration = Math.max(duration, clip.timelineEnd);
  for (const clip of audioClips) duration = Math.max(duration, clip.timelineEnd);
  return duration;
};

const withTimelineMetrics = (state: EditorState): EditorState => {
  const totalDuration = getTotalDuration(state.clips, state.audioClips);
  const currentTime = Math.min(state.currentTime, totalDuration);
  return {
    ...state,
    totalDuration,
    currentTime,
    isPlaying: totalDuration > 0 && state.isPlaying,
  };
};

interface HistorySnapshot {
  clips: Clip[];
  audioClips: AudioClip[];
  effects: EditorState["effects"];
  selectedItem: EditorState["selectedItem"];
}

const captureSnapshot = (source: EditorState): HistorySnapshot => ({
  // Editor updates replace arrays and changed records instead of mutating them,
  // so snapshots can safely share immutable clip metadata, thumbnails, and peaks.
  clips: source.clips,
  audioClips: source.audioClips,
  effects: source.effects,
  selectedItem: source.selectedItem,
});

const selectionExists = (
  selection: MediaSelection | null,
  clips: Clip[],
  audioClips: AudioClip[],
) => !selection || (selection.type === "video"
  ? clips.some((clip) => clip.id === selection.id)
  : audioClips.some((clip) => clip.id === selection.id));

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState(initialEditorState);
  const stateRef = useRef(state);
  const objectUrlsRef = useRef(new Set<string>());
  const historyRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  const hasAttemptedAutosaveLoadRef = useRef(false);
  stateRef.current = state;

  const recordHistory = useCallback((source = stateRef.current) => {
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY_LENGTH - 1)),
      captureSnapshot(source),
    ];
    futureRef.current = [];
  }, []);

  const updateState = useCallback((patch: Partial<EditorState>) => {
    setState((previous) => {
      const next = { ...previous, ...patch };
      return patch.clips || patch.audioClips ? withTimelineMetrics(next) : next;
    });
  }, []);

  const setVideoFile = useCallback(async (file: File | null) => {
    if (!file) {
      const current = stateRef.current;
      if (!current.clips.length) return;
      recordHistory(current);
      setState((previous) => {
        const removedIds = new Set(previous.clips.map((clip) => clip.id));
        const audioClips = previous.audioClips.filter(
          (clip) => !clip.sourceVideoClipId || !removedIds.has(clip.sourceVideoClipId),
        );
        const next = {
          ...previous,
          clips: [],
          audioClips,
          effects: [],
          selectedItem: selectionExists(previous.selectedItem, [], audioClips)
            ? previous.selectedItem
            : null,
          isDirty: true,
          canUndo: true,
          canRedo: false,
          isSeeking: true,
        };
        return withTimelineMetrics(next);
      });
      return;
    }

    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    updateState({ isGeneratingThumbnails: true, mediaError: null });
    try {
      const [clipDuration, thumbnail, peaks] = await Promise.all([
        getMediaDuration(url, "video"),
        createVideoThumbnailStrip(url),
        createAudioPeaksIfPresent(file),
      ]);
      recordHistory();
      setState((previous) => {
        const timelineStart = previous.clips.reduce(
          (end, clip) => Math.max(end, clip.timelineEnd),
          0,
        );
        const id = makeId("video");
        const clip: Clip = {
          id,
          name: file.name,
          zIndex: getNextZIndex(previous.clips),
          clipURL: url,
          clipStart: 0,
          clipEnd: clipDuration,
          clipDuration,
          sourceDuration: clipDuration,
          timelineStart,
          timelineEnd: timelineStart + clipDuration,
          thumbnail,
          transform: { ...DEFAULT_TRANSFORM },
        };
        const soundtrack: AudioClip | null = peaks ? {
          id: makeId("audio"),
          name: `${file.name} · soundtrack`,
          zIndex: getNextZIndex(previous.audioClips),
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
          sourceVideoClipId: id,
        } : null;
        return withTimelineMetrics({
          ...previous,
          clips: [...previous.clips, clip],
          audioClips: soundtrack
            ? [...previous.audioClips, soundtrack]
            : previous.audioClips,
          isGeneratingThumbnails: false,
          selectedItem: { type: "video", id },
          isDirty: true,
          canUndo: true,
          canRedo: false,
        });
      });
    } catch (error) {
      objectUrlsRef.current.delete(url);
      URL.revokeObjectURL(url);
      updateState({
        isGeneratingThumbnails: false,
        mediaError: getErrorMessage(error),
      });
    }
  }, [recordHistory, updateState]);

  const setAudioFile = useCallback(async (file: File | null) => {
    if (!file) {
      const current = stateRef.current;
      if (!current.audioClips.some((clip) => !clip.sourceVideoClipId)) return;
      recordHistory(current);
      setState((previous) => {
        const audioClips = previous.audioClips.filter((clip) => clip.sourceVideoClipId);
        return withTimelineMetrics({
          ...previous,
          audioClips,
          selectedItem: selectionExists(previous.selectedItem, previous.clips, audioClips)
            ? previous.selectedItem
            : null,
          isDirty: true,
          canUndo: true,
          canRedo: false,
          isSeeking: true,
        });
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
          zIndex: getNextZIndex(previous.audioClips),
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
        return withTimelineMetrics({
          ...previous,
          audioClips: [...previous.audioClips, clip],
          isLoadingAudio: false,
          selectedItem: { type: "audio", id: clip.id },
          isDirty: true,
          canUndo: true,
          canRedo: false,
        });
      });
    } catch (error) {
      objectUrlsRef.current.delete(url);
      URL.revokeObjectURL(url);
      updateState({ isLoadingAudio: false, mediaError: getErrorMessage(error) });
    }
  }, [recordHistory, updateState]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
      releaseCachedProjectAsset(url);
    });
  }, []);

  useEffect(() => {
    const retainedUrls = new Set<string>();
    const retainClips = (clips: Clip[], audioClips: AudioClip[]) => {
      clips.forEach((clip) => retainedUrls.add(clip.clipURL));
      audioClips.forEach((clip) => retainedUrls.add(clip.clipURL));
    };
    retainClips(state.clips, state.audioClips);
    historyRef.current.forEach((snapshot) => {
      retainClips(snapshot.clips, snapshot.audioClips);
    });
    futureRef.current.forEach((snapshot) => {
      retainClips(snapshot.clips, snapshot.audioClips);
    });
    objectUrlsRef.current.forEach((url) => {
      if (retainedUrls.has(url)) return;
      URL.revokeObjectURL(url);
      releaseCachedProjectAsset(url);
      objectUrlsRef.current.delete(url);
    });
  }, [state.audioClips, state.clips]);

  const seek = useCallback((time: number) => {
    const totalDuration = stateRef.current.totalDuration;
    updateState({
      currentTime: Math.max(0, Math.min(time, totalDuration)),
      isSeeking: true,
    });
  }, [updateState]);

  const removeVideoClip = useCallback((id: string) => {
    const current = stateRef.current;
    if (!current.clips.some((clip) => clip.id === id)) return;
    recordHistory(current);
    setState((previous) => {
      const clips = previous.clips.filter((clip) => clip.id !== id);
      const audioClips = previous.audioClips.filter((clip) => clip.sourceVideoClipId !== id);
      const selectedItem = selectionExists(previous.selectedItem, clips, audioClips)
        ? previous.selectedItem
        : null;
      return withTimelineMetrics({
        ...previous,
        clips,
        audioClips,
        effects: previous.effects.filter((effect) => effect.clipId !== id),
        selectedItem,
        isDirty: true,
        canUndo: true,
        canRedo: false,
        isSeeking: true,
      });
    });
  }, [recordHistory]);

  const removeAudioClip = useCallback((id: string) => {
    const current = stateRef.current;
    if (!current.audioClips.some((clip) => clip.id === id)) return;
    recordHistory(current);
    setState((previous) => {
      const audioClips = previous.audioClips.filter((clip) => clip.id !== id);
      return withTimelineMetrics({
        ...previous,
        audioClips,
        selectedItem: previous.selectedItem?.type === "audio" && previous.selectedItem.id === id
          ? null
          : previous.selectedItem,
        isDirty: true,
        canUndo: true,
        canRedo: false,
        isSeeking: true,
      });
    });
  }, [recordHistory]);

  const updateVideoClip = useCallback((id: string, patch: Partial<Clip>) => {
    const current = stateRef.current;
    const original = current.clips.find((clip) => clip.id === id);
    if (!original || !hasChanges(original, patch)) return;
    recordHistory(current);
    setState((previous) => {
      const clips = previous.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip);
      const updated = clips.find((clip) => clip.id === id);
      if (!updated) return previous;
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
      return withTimelineMetrics({
        ...previous,
        clips,
        audioClips,
        isDirty: true,
        canUndo: true,
        canRedo: false,
      });
    });
  }, [recordHistory]);

  const updateAudioClip = useCallback((id: string, patch: Partial<AudioClip>) => {
    const current = stateRef.current;
    const original = current.audioClips.find((clip) => clip.id === id);
    if (!original || !hasChanges(original, patch)) return;
    recordHistory(current);
    setState((previous) => withTimelineMetrics({
      ...previous,
      audioClips: previous.audioClips.map((clip) =>
        clip.id === id ? { ...clip, ...patch } : clip,
      ),
      isDirty: true,
      canUndo: true,
      canRedo: false,
    }));
  }, [recordHistory]);

  const bringToFront = useCallback((selection: MediaSelection) => {
    const current = stateRef.current;
    if (selection.type === "video") {
      updateVideoClip(selection.id, { zIndex: getNextZIndex(current.clips) });
    } else {
      updateAudioClip(selection.id, { zIndex: getNextZIndex(current.audioClips) });
    }
  }, [updateAudioClip, updateVideoClip]);

  const duplicateSelected = useCallback(() => {
    const current = stateRef.current;
    const selection = current.selectedItem;
    if (!selection) return;

    if (selection.type === "video") {
      const source = current.clips.find((clip) => clip.id === selection.id);
      if (!source) return;
      recordHistory(current);
      const id = makeId("video");
      const offset = 250;
      const duplicate: Clip = {
        ...source,
        id,
        name: `${source.name} copy`,
        timelineStart: source.timelineStart + offset,
        timelineEnd: source.timelineEnd + offset,
        zIndex: getNextZIndex(current.clips),
        transform: { ...source.transform },
      };
      const nextAudioZIndex = getNextZIndex(current.audioClips);
      const linked = current.audioClips
        .filter((audio) => audio.sourceVideoClipId === source.id)
        .map((audio, index) => ({
          ...audio,
          id: makeId("audio"),
          sourceVideoClipId: id,
          name: `${audio.name} copy`,
          timelineStart: audio.timelineStart + offset,
          timelineEnd: audio.timelineEnd + offset,
          zIndex: nextAudioZIndex + index,
          peaks: audio.peaks,
        }));
      updateState({
        clips: [...current.clips, duplicate],
        audioClips: [...current.audioClips, ...linked],
        selectedItem: { type: "video", id },
        isDirty: true,
        canUndo: true,
        canRedo: false,
      });
      return;
    }

    const source = current.audioClips.find((clip) => clip.id === selection.id);
    if (!source) return;
    recordHistory(current);
    const duplicate: AudioClip = {
      ...source,
      id: makeId("audio"),
      name: `${source.name} copy`,
      timelineStart: source.timelineStart + 250,
      timelineEnd: source.timelineEnd + 250,
      zIndex: getNextZIndex(current.audioClips),
      sourceVideoClipId: undefined,
      peaks: source.peaks,
    };
    updateState({
      audioClips: [...current.audioClips, duplicate],
      selectedItem: { type: "audio", id: duplicate.id },
      isDirty: true,
      canUndo: true,
      canRedo: false,
    });
  }, [recordHistory, updateState]);

  const splitAudioClip = useCallback(() => {
    const current = stateRef.current;
    const selected = current.selectedItem?.type === "audio"
      ? current.audioClips.find((clip) => clip.id === current.selectedItem?.id) ?? null
      : getTopTimelineItem(current.currentTime, current.audioClips);
    if (!selected) return;
    const offset = current.currentTime - selected.timelineStart;
    if (offset < MIN_SPLIT_DURATION_MS
      || offset > selected.clipDuration - MIN_SPLIT_DURATION_MS) return;

    recordHistory(current);
    const peakIndex = Math.max(
      1,
      Math.round(selected.peaks.length * offset / selected.clipDuration),
    );
    const first: AudioClip = {
      ...selected,
      id: makeId("audio"),
      sourceVideoClipId: undefined,
      clipEnd: selected.clipStart + offset,
      clipDuration: offset,
      timelineEnd: current.currentTime,
      peaks: selected.peaks.slice(0, peakIndex),
    };
    const second: AudioClip = {
      ...selected,
      id: makeId("audio"),
      sourceVideoClipId: undefined,
      clipStart: selected.clipStart + offset,
      clipDuration: selected.clipDuration - offset,
      timelineStart: current.currentTime,
      peaks: selected.peaks.slice(peakIndex),
    };
    updateState({
      audioClips: current.audioClips.flatMap((clip) =>
        clip.id === selected.id ? [first, second] : [clip],
      ),
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
    setState((previous) => withTimelineMetrics({
      ...previous,
      ...snapshot,
      canUndo: historyRef.current.length > 0,
      canRedo: true,
      isDirty: true,
      isSeeking: true,
    }));
  }, []);

  const redo = useCallback(() => {
    const snapshot = futureRef.current.pop();
    if (!snapshot) return;
    historyRef.current.push(captureSnapshot(stateRef.current));
    setState((previous) => withTimelineMetrics({
      ...previous,
      ...snapshot,
      canUndo: true,
      canRedo: futureRef.current.length > 0,
      isDirty: true,
      isSeeking: true,
    }));
  }, []);

  const splitClip = useCallback(async () => {
    const current = stateRef.current;
    const selected = current.selectedItem?.type === "video"
      ? current.clips.find((clip) => clip.id === current.selectedItem?.id) ?? null
      : getTopTimelineItem(current.currentTime, current.clips);
    if (!selected) return;
    const offset = current.currentTime - selected.timelineStart;
    if (offset < MIN_SPLIT_DURATION_MS
      || offset > selected.clipDuration - MIN_SPLIT_DURATION_MS) return;

    const sourceSplit = selected.clipStart + offset;
    updateState({ isGeneratingThumbnails: true, mediaError: null });
    try {
      const [firstThumbnail, secondThumbnail] = await Promise.all([
        createVideoThumbnailStrip(selected.clipURL, {
          start: selected.clipStart,
          end: sourceSplit,
        }),
        createVideoThumbnailStrip(selected.clipURL, {
          start: sourceSplit,
          end: selected.clipEnd,
        }),
      ]);
      const latest = stateRef.current;
      const latestClip = latest.clips.find((clip) => clip.id === selected.id);
      if (!latestClip
        || latestClip.clipStart !== selected.clipStart
        || latestClip.clipEnd !== selected.clipEnd
        || latestClip.timelineStart !== selected.timelineStart
        || latestClip.timelineEnd !== selected.timelineEnd) {
        updateState({
          isGeneratingThumbnails: false,
          mediaError: "The clip changed while it was being split. Please try again.",
        });
        return;
      }

      recordHistory(latest);
      const first: Clip = {
        ...selected,
        id: makeId("video"),
        clipEnd: sourceSplit,
        clipDuration: offset,
        timelineEnd: current.currentTime,
        thumbnail: firstThumbnail,
      };
      const second: Clip = {
        ...selected,
        id: makeId("video"),
        clipStart: sourceSplit,
        clipDuration: selected.clipDuration - offset,
        timelineStart: current.currentTime,
        thumbnail: secondThumbnail,
      };
      const linkedAudio = latest.audioClips.filter(
        (audio) => audio.sourceVideoClipId === selected.id,
      );
      const splitAudio = linkedAudio.flatMap((audio) => {
        const peakIndex = Math.max(
          1,
          Math.round(audio.peaks.length * offset / selected.clipDuration),
        );
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
        clips: latest.clips.flatMap((clip) =>
          clip.id === selected.id ? [first, second] : [clip],
        ),
        audioClips: latest.audioClips
          .filter((audio) => audio.sourceVideoClipId !== selected.id)
          .concat(splitAudio),
        effects: latest.effects.flatMap((effect) => effect.clipId === selected.id
          ? [{ ...effect, clipId: first.id }, { ...effect, clipId: second.id }]
          : [effect]),
        selectedItem: { type: "video", id: second.id },
        isGeneratingThumbnails: false,
        isDirty: true,
        canUndo: true,
        canRedo: false,
      });
    } catch (error) {
      updateState({
        isGeneratingThumbnails: false,
        mediaError: getErrorMessage(error),
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
    const snapshot = stateRef.current;
    try {
      await saveProjectSnapshot(snapshot);
      setState((current) => {
        const savedStateIsCurrent = current.clips === snapshot.clips
          && current.audioClips === snapshot.audioClips
          && current.effects === snapshot.effects
          && current.projectName === snapshot.projectName;
        return savedStateIsCurrent
          ? { ...current, isDirty: false, mediaError: null }
          : current;
      });
    } catch (error) {
      updateState({ mediaError: getErrorMessage(error) });
    }
  }, [updateState]);

  const loadAutosave = useCallback(async () => {
    if (hasAttemptedAutosaveLoadRef.current) return;
    hasAttemptedAutosaveLoadRef.current = true;
    try {
      const restored = await loadProjectSnapshot();
      if (!restored || stateRef.current.clips.length || stateRef.current.audioClips.length) return;
      [...restored.clips, ...restored.audioClips]
        .forEach((clip) => objectUrlsRef.current.add(clip.clipURL));
      setState((previous) => withTimelineMetrics({
        ...previous,
        projectName: restored.name,
        clips: restored.clips,
        audioClips: restored.audioClips,
        effects: restored.effects,
        currentTime: 0,
        isSeeking: true,
        isDirty: false,
      }));
    } catch (error) {
      updateState({ mediaError: getErrorMessage(error) });
    }
  }, [updateState]);

  useEffect(() => {
    void loadAutosave();
  }, [loadAutosave]);

  useEffect(() => {
    if (!state.isDirty) return;
    const timeout = window.setTimeout(() => void saveProject(), 1800);
    return () => window.clearTimeout(timeout);
  }, [state.audioClips, state.clips, state.effects, state.isDirty, state.projectName, saveProject]);

  useEffect(() => {
    const warnIfDirty = (event: BeforeUnloadEvent) => {
      if (!stateRef.current.isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnIfDirty);
    return () => window.removeEventListener("beforeunload", warnIfDirty);
  }, []);

  const selectItem = useCallback((selectedItem: MediaSelection | null) => {
    updateState({ selectedItem });
  }, [updateState]);

  const setProjectName = useCallback((projectName: string) => {
    updateState({ projectName, isDirty: true });
  }, [updateState]);

  const setLoopPlayback = useCallback((loopPlayback: boolean) => {
    updateState({ loopPlayback });
  }, [updateState]);

  const toggleEffect = useCallback((clipId: string, effectName: EffectName) => {
    const current = stateRef.current;
    if (!current.clips.some((clip) => clip.id === clipId)) return;
    recordHistory(current);
    const exists = current.effects.some(
      (effect) => effect.clipId === clipId && effect.name === effectName,
    );
    updateState({
      effects: exists
        ? current.effects.filter(
            (effect) => effect.clipId !== clipId || effect.name !== effectName,
          )
        : [...current.effects, { clipId, name: effectName }],
      isDirty: true,
      canUndo: true,
      canRedo: false,
    });
  }, [recordHistory, updateState]);

  const setTimelineZoom = useCallback((zoom: number) => {
    updateState({ timelineZoom: Math.max(0.25, Math.min(8, zoom)) });
  }, [updateState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement
        && target.matches("input, textarea, select, [contenteditable='true']")) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && key === "y") {
        event.preventDefault();
        redo();
      } else if (modifier && key === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (modifier && key === "s") {
        event.preventDefault();
        void saveProject();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === " ") {
        event.preventDefault();
        updateState({ isPlaying: !stateRef.current.isPlaying });
      } else if (key === "s") {
        event.preventDefault();
        if (stateRef.current.selectedItem?.type === "audio") splitAudioClip();
        else void splitClip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    deleteSelected,
    duplicateSelected,
    redo,
    saveProject,
    splitAudioClip,
    splitClip,
    undo,
    updateState,
  ]);

  const value = useMemo<EditorContextType>(() => ({
    ...state,
    setVideoFile,
    setAudioFile,
    removeVideoClip,
    removeAudioClip,
    selectItem,
    updateVideoClip,
    updateAudioClip,
    bringToFront,
    duplicateSelected,
    deleteSelected,
    splitAudioClip,
    undo,
    redo,
    setProjectName,
    saveProject,
    loadAutosave,
    setMediaError: (mediaError) => updateState({ mediaError }),
    toggleEffect,
    setSnapEnabled: (snapEnabled) => updateState({ snapEnabled }),
    setLoopPlayback,
    play: () => {
      if (stateRef.current.totalDuration > 0) updateState({ isPlaying: true });
    },
    pause: () => updateState({ isPlaying: false }),
    seek,
    updatePlayback: updateState,
    splitClip,
    setTimelineZoom,
    zoomIn: () => setTimelineZoom(stateRef.current.timelineZoom * 1.25),
    zoomOut: () => setTimelineZoom(stateRef.current.timelineZoom / 1.25),
    resetZoom: () => updateState({ timelineZoom: 1 }),
  }), [
    state,
    setVideoFile,
    setAudioFile,
    removeVideoClip,
    removeAudioClip,
    selectItem,
    updateVideoClip,
    updateAudioClip,
    bringToFront,
    duplicateSelected,
    deleteSelected,
    splitAudioClip,
    undo,
    redo,
    setProjectName,
    setLoopPlayback,
    saveProject,
    loadAutosave,
    toggleEffect,
    seek,
    splitClip,
    setTimelineZoom,
    updateState,
  ]);

  const mediaActions = useMemo<EditorMediaActions>(() => ({
    setVideoFile,
    setAudioFile,
  }), [setAudioFile, setVideoFile]);

  const exportData = useMemo<EditorExportData>(() => ({
    clips: state.clips,
    audioClips: state.audioClips,
    effects: state.effects,
    totalDuration: state.totalDuration,
  }), [state.audioClips, state.clips, state.effects, state.totalDuration]);

  const propertiesData = useMemo<EditorPropertiesData>(() => ({
    clips: state.clips,
    audioClips: state.audioClips,
    selectedItem: state.selectedItem,
    updateVideoClip,
    updateAudioClip,
    bringToFront,
    duplicateSelected,
    deleteSelected,
    saveProject,
    setProjectName,
    projectName: state.projectName,
    isDirty: state.isDirty,
    loopPlayback: state.loopPlayback,
    setLoopPlayback,
    selectItem,
  }), [
    state.clips,
    state.audioClips,
    state.selectedItem,
    state.projectName,
    state.isDirty,
    state.loopPlayback,
    updateVideoClip,
    updateAudioClip,
    bringToFront,
    duplicateSelected,
    deleteSelected,
    saveProject,
    setProjectName,
    setLoopPlayback,
    selectItem,
  ]);

  return (
    <EditorMediaActionsContext.Provider value={mediaActions}>
      <EditorExportDataContext.Provider value={exportData}>
        <EditorPropertiesContext.Provider value={propertiesData}>
          <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
        </EditorPropertiesContext.Provider>
      </EditorExportDataContext.Provider>
    </EditorMediaActionsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEditor = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (!context) throw new Error("useEditor must be used within an EditorProvider");
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEditorMediaActions = (): EditorMediaActions => {
  const context = useContext(EditorMediaActionsContext);
  if (!context) throw new Error("useEditorMediaActions must be used within an EditorProvider");
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEditorExportData = (): EditorExportData => {
  const context = useContext(EditorExportDataContext);
  if (!context) throw new Error("useEditorExportData must be used within an EditorProvider");
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEditorProperties = (): EditorPropertiesData => {
  const context = useContext(EditorPropertiesContext);
  if (!context) throw new Error("useEditorProperties must be used within an EditorProvider");
  return context;
};
