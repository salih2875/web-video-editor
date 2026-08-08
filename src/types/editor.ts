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

export type EffectName = "Blur" | "Noise";

export interface Effect {
  clipId: string;
  name: EffectName;
}

export interface EditorState {
  clips: Clip[];
  audioClips: AudioClip[];
  effects: Effect[];
  selectedItem: MediaSelection | null;
  totalDuration: number;
  currentTime: number;
  isPlaying: boolean;
  isSeeking: boolean;
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
  setProjectName: (name: string) => void;
  saveProject: () => Promise<void>;
  loadAutosave: () => Promise<void>;
  setMediaError: (message: string | null) => void;
  toggleEffect: (clipId: string, effectName: EffectName) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setLoopPlayback: (enabled: boolean) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  updatePlayback: (patch: Partial<Pick<EditorState, "currentTime" | "isPlaying" | "isSeeking">>) => void;
  splitClip: () => Promise<void>;
  setTimelineZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}
