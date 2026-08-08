export interface TimeRange {
  start: number;
  end: number;
}

export interface Clip {
  id: string;
  name: string;
  zIndex: number;
  clipURL: string;
  clipStart: number;
  clipEnd: number;
  clipDuration: number;
  sourceDuration: number;
  timelineStart: number;
  timelineEnd: number;
  thumbnail: HTMLCanvasElement | null;
  effects: string[];
  transform: VideoTransform;
}

export interface VideoTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  fit: "contain" | "cover";
}

export interface AudioClip {
  id: string;
  name: string;
  zIndex: number;
  clipURL: string;
  clipStart: number;
  clipEnd: number;
  clipDuration: number;
  sourceDuration: number;
  timelineStart: number;
  timelineEnd: number;
  peaks: number[];
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  sourceVideoClipId?: string;
}

export type MediaSelection =
  | { type: "video"; id: string }
  | { type: "audio"; id: string };

export interface Effect {
  id: string;
  name: string;
  filter: unknown;
}

export type FfmpegStatus = "idle" | "loading" | "loaded" | "error";
export type TrimStatus = "idle" | "trimming" | "error" | "done";

export interface EditorState {
  videoFile: File | null;
  audioFile: File | null;
  videoSources: string[];
  videoElement: HTMLVideoElement | null;
  clips: Clip[];
  audioClips: AudioClip[];
  Effects: Effect[];
  currentClip: Clip | null;
  selectedItem: MediaSelection | null;
  duration: number;
  totalDuration: number;
  currentTime: number;
  isPlaying: boolean;
  isSeeking: boolean;
  selectedRange: TimeRange | null;
  isGeneratingThumbnails: boolean;
  isLoadingAudio: boolean;
  mediaError: string | null;
  projectName: string;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  snapEnabled: boolean;
  loopPlayback: boolean;
  timelineZoom: number;
  timelineScrollPosition: number;
  ffmpegStatus: FfmpegStatus;
  trimStatus: TrimStatus;
  trimProgress: number;
  lastTrimmedUrl: string | null;
  trimError: string | null;
}

export interface EditorContextType extends EditorState {
  setVideoFile: (file: File | null) => Promise<void>;
  setAudioFile: (file: File | null) => Promise<void>;
  removeVideoClip: (id: string) => void;
  removeAudioClip: (id: string) => void;
  selectItem: (selection: MediaSelection | null) => void;
  updateVideoClip: (id: string, patch: Partial<Clip>) => void;
  updateAudioClip: (id: string, patch: Partial<AudioClip>) => void;
  bringToFront: (selection: MediaSelection) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  splitAudioClip: () => void;
  undo: () => void;
  redo: () => void;
  saveProject: () => Promise<void>;
  loadAutosave: () => Promise<void>;
  setSnapEnabled: (enabled: boolean) => void;
  setLoopPlayback: (enabled: boolean) => void;
  setVideoElement: (element: HTMLVideoElement | null) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setSelectedRange: (range: TimeRange | null) => void;
  splitClip: () => Promise<void>;
  setTimelineZoom: (zoom: number) => void;
  setTimelineScrollPosition: (position: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  zoomToFit: () => void;
  loadFFmpeg: () => Promise<void>;
  trimVideo: () => Promise<void>;
  clearTrimmedVideo: () => void;
}

export type InternalEditorContextType = EditorContextType & {
  _updateState: (newState: Partial<EditorState>) => void;
  findActiveClip: (time: number, clips: Clip[]) => { clip: Clip | null };
  findActiveClips: (
    timeBegin: number,
    timeEnd: number,
    clips: Clip[],
  ) => { clips: Clip[] };
};
