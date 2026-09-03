import type { EffectName } from "../effects/effectCatalog";

export type { EffectName } from "../effects/effectCatalog";

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
  /** Present while this track follows a video's timing; `undefined` explicitly detaches it. */
  sourceVideoClipId?: string | undefined;
}

export interface TextClip {
  id: string;
  name: string;
  text: string;
  zIndex: number;
  timelineStart: number;
  timelineEnd: number;
  clipStart: number;
  clipEnd: number;
  clipDuration: number;
  sourceDuration: number;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  align: "left" | "center" | "right";
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
}

export type MediaSelection =
  | { type: "video"; id: string }
  | { type: "audio"; id: string }
  | { type: "text"; id: string };

export interface Effect {
  clipId: string;
  name: EffectName;
}

export interface EditorState {
  clips: Clip[];
  audioClips: AudioClip[];
  textClips: TextClip[];
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

/**
 * Public mutation contracts deliberately exclude identity and media-source fields.
 * Keeping these narrower than `Partial<Clip>` prevents UI code from accidentally
 * replacing an object URL, source duration, thumbnail, or entity id.
 */
export type VideoClipPatch = Partial<Pick<
  Clip,
  | "name"
  | "zIndex"
  | "clipStart"
  | "clipEnd"
  | "clipDuration"
  | "timelineStart"
  | "timelineEnd"
  | "transform"
>>;

export type AudioClipPatch = Partial<Pick<
  AudioClip,
  | "name"
  | "zIndex"
  | "clipStart"
  | "clipEnd"
  | "clipDuration"
  | "timelineStart"
  | "timelineEnd"
  | "volume"
  | "muted"
  | "fadeIn"
  | "fadeOut"
  | "sourceVideoClipId"
>>;

export type TextClipPatch = Partial<Pick<
  TextClip,
  | "name"
  | "text"
  | "zIndex"
  | "clipStart"
  | "clipEnd"
  | "clipDuration"
  | "timelineStart"
  | "timelineEnd"
  | "x"
  | "y"
  | "fontFamily"
  | "fontSize"
  | "color"
  | "opacity"
  | "rotation"
  | "align"
  | "fontWeight"
  | "fontStyle"
>>;

export interface EditorContextType extends EditorState {
  setVideoFile: (file: File | null) => Promise<void>;
  setAudioFile: (file: File | null) => Promise<void>;
  removeVideoClip: (id: string) => void;
  removeAudioClip: (id: string) => void;
  addTextClip: () => void;
  removeTextClip: (id: string) => void;
  selectItem: (selection: MediaSelection | null) => void;
  updateVideoClip: (id: string, patch: VideoClipPatch) => void;
  updateAudioClip: (id: string, patch: AudioClipPatch) => void;
  updateTextClip: (id: string, patch: TextClipPatch) => void;
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
