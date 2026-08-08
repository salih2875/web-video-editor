import type { AudioClip, Clip, EditorState } from "../types/editor";

const DATABASE_NAME = "pixi-video-editor";
const STORE_NAME = "projects";
const AUTOSAVE_KEY = "autosave";

interface StoredProject {
  id: string;
  name: string;
  savedAt: number;
  clips: Clip[];
  audioClips: AudioClip[];
  assets: Array<{ url: string; blob: Blob }>;
}

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
  const assets = await Promise.all(urls.map(async (url) => ({
    url,
    blob: await fetch(url).then((response) => response.blob()),
  })));
  const project: StoredProject = {
    id: AUTOSAVE_KEY,
    name: state.projectName,
    savedAt: Date.now(),
    clips: state.clips.map((clip) => ({ ...clip, thumbnail: null })),
    audioClips: state.audioClips,
    assets,
  };
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save project."));
  });
  database.close();
};

export const loadProjectSnapshot = async (): Promise<{
  name: string;
  clips: Clip[];
  audioClips: AudioClip[];
} | null> => {
  const database = await openDatabase();
  const project = await new Promise<StoredProject | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(AUTOSAVE_KEY);
    request.onsuccess = () => resolve(request.result as StoredProject | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not restore project."));
  });
  database.close();
  if (!project) return null;
  const urlMap = new Map(project.assets.map((asset) => [asset.url, URL.createObjectURL(asset.blob)]));
  return {
    name: project.name,
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
  };
};
