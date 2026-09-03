import { isEffectName } from "../effects/effectCatalog";
import type { AudioClip, Clip, EditorState, Effect, TextClip } from "../types/editor";

const DATABASE_NAME = "pixi-video-editor";
const STORE_NAME = "projects";
const AUTOSAVE_KEY = "autosave";

interface StoredProject {
  id: string;
  name: string;
  savedAt: number;
  clips: Clip[];
  audioClips: AudioClip[];
  textClips?: TextClip[];
  effects?: Array<{ clipId?: unknown; name?: unknown }>;
  assets: Array<{ url: string; blob: Blob }>;
}

const assetBlobCache = new Map<string, Promise<Blob>>();

export const releaseCachedProjectAsset = (url: string) => {
  assetBlobCache.delete(url);
};

export const normalizeStoredEffects = (
  effects: StoredProject["effects"],
): Effect[] => (effects ?? []).flatMap((effect) =>
  typeof effect?.clipId === "string" && isEffectName(effect.name)
    ? [{ clipId: effect.clipId, name: effect.name }]
    : []);

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Could not open project storage."));
});

export const saveProjectSnapshot = async (state: EditorState): Promise<void> => {
  const urls = [...new Set([
    ...state.clips.map((clip) => clip.clipURL),
    ...state.audioClips.map((clip) => clip.clipURL),
  ])];
  const assets = await Promise.all(urls.map(async (url) => {
    let blobPromise = assetBlobCache.get(url);
    if (!blobPromise) {
      blobPromise = fetch(url).then((response) => {
        if (!response.ok) throw new Error(`Could not read project asset (${response.status}).`);
        return response.blob();
      });
      assetBlobCache.set(url, blobPromise);
      blobPromise.catch(() => assetBlobCache.delete(url));
    }
    return { url, blob: await blobPromise };
  }));
  const project: StoredProject = {
    id: AUTOSAVE_KEY,
    name: state.projectName,
    savedAt: Date.now(),
    clips: state.clips.map((clip) => ({ ...clip, thumbnail: null })),
    audioClips: state.audioClips,
    textClips: state.textClips,
    effects: state.effects,
    assets,
  };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(project);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error ?? new Error("Could not save project."),
      );
    });
  } finally {
    database.close();
  }
};

export const loadProjectSnapshot = async (): Promise<{
  name: string;
  clips: Clip[];
  audioClips: AudioClip[];
  textClips: TextClip[];
  effects: Effect[];
} | null> => {
  const database = await openDatabase();
  let project: StoredProject | undefined;
  try {
    project = await new Promise<StoredProject | undefined>((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(AUTOSAVE_KEY) as IDBRequest<StoredProject | undefined>;
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not restore project."));
    });
  } finally {
    database.close();
  }
  if (!project) return null;
  const urlMap = new Map(project.assets.map((asset) => [asset.url, URL.createObjectURL(asset.blob)]));
  return {
    name: project.name,
    effects: normalizeStoredEffects(project.effects),
    clips: project.clips.map((clip, index) => ({
      ...clip,
      name: clip.name || `Video ${index + 1}`,
      zIndex: Number.isFinite(clip.zIndex) ? clip.zIndex : index,
      sourceDuration: clip.sourceDuration || clip.clipEnd,
      transform: clip.transform ?? { x: 0, y: 0, scale: 1, rotation: 0, fit: "contain" },
      clipURL: urlMap.get(clip.clipURL) ?? clip.clipURL,
      thumbnail: null,
    })),
    audioClips: project.audioClips.map((clip, index) => ({
      ...clip,
      zIndex: Number.isFinite(clip.zIndex) ? clip.zIndex : index,
      sourceDuration: clip.sourceDuration || clip.clipEnd,
      fadeIn: clip.fadeIn ?? 0,
      fadeOut: clip.fadeOut ?? 0,
      clipURL: urlMap.get(clip.clipURL) ?? clip.clipURL,
    })),
    textClips: (project.textClips ?? []).map((clip, index) => ({
      ...clip,
      name: clip.name || `Text ${index + 1}`,
      text: clip.text || "Text",
      zIndex: Number.isFinite(clip.zIndex) ? clip.zIndex : index,
      x: Number.isFinite(clip.x) ? clip.x : 640,
      y: Number.isFinite(clip.y) ? clip.y : 360,
      fontFamily: clip.fontFamily || "Arial",
      fontSize: Number.isFinite(clip.fontSize) ? clip.fontSize : 64,
      color: clip.color || "#ffffff",
      opacity: Number.isFinite(clip.opacity) ? clip.opacity : 1,
      rotation: Number.isFinite(clip.rotation) ? clip.rotation : 0,
      align: clip.align ?? "center",
      fontWeight: clip.fontWeight ?? "normal",
      fontStyle: clip.fontStyle ?? "normal",
    })),
  };
};
