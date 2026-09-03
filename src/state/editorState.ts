import type {
  AudioClip,
  Clip,
  EditorState,
  MediaSelection,
  TextClip,
} from "../types/editor";

export const initialEditorState: EditorState = {
  clips: [],
  audioClips: [],
  textClips: [],
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

export interface HistorySnapshot {
  clips: Clip[];
  audioClips: AudioClip[];
  textClips: TextClip[];
  effects: EditorState["effects"];
  selectedItem: EditorState["selectedItem"];
}

export const captureHistorySnapshot = (state: EditorState): HistorySnapshot => ({
  // State updates replace arrays and records. Sharing immutable media metadata
  // avoids copying large thumbnails and waveform arrays into every history entry.
  clips: state.clips,
  audioClips: state.audioClips,
  textClips: state.textClips,
  effects: state.effects,
  selectedItem: state.selectedItem,
});

export const hasChanges = <T extends object>(source: T, patch: Partial<T>): boolean =>
  Object.entries(patch).some(([key, value]) => Reflect.get(source, key) !== value);

export const getNextZIndex = (items: ReadonlyArray<{ zIndex: number }>): number =>
  items.reduce((highest, item) => Math.max(highest, item.zIndex), -1) + 1;

export const selectionExists = (
  selection: MediaSelection | null,
  clips: readonly Clip[],
  audioClips: readonly AudioClip[],
  textClips: readonly TextClip[],
): boolean => {
  if (!selection) return true;

  switch (selection.type) {
    case "video":
      return clips.some((clip) => clip.id === selection.id);
    case "audio":
      return audioClips.some((clip) => clip.id === selection.id);
    case "text":
      return textClips.some((clip) => clip.id === selection.id);
  }
};

const getTotalDuration = (
  clips: readonly Clip[],
  audioClips: readonly AudioClip[],
  textClips: readonly TextClip[],
): number => {
  const timelineEnds = [
    ...clips.map((clip) => clip.timelineEnd),
    ...audioClips.map((clip) => clip.timelineEnd),
    ...textClips.map((clip) => clip.timelineEnd),
  ];
  return Math.max(0, ...timelineEnds);
};

export const withTimelineMetrics = (state: EditorState): EditorState => {
  const totalDuration = getTotalDuration(state.clips, state.audioClips, state.textClips);
  return {
    ...state,
    totalDuration,
    currentTime: Math.max(0, Math.min(state.currentTime, totalDuration)),
    isPlaying: totalDuration > 0 && state.isPlaying,
  };
};

export const createEntityId = (prefix: "video" | "audio" | "text"): string =>
  `${prefix}_${crypto.randomUUID()}`;
