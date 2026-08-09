import type { Clip } from "../types/editor";
import { getClipSourceTimeSeconds } from "./frameTiming";
import type { PixiTimelineRenderer } from "./PixiTimelineRenderer";

const MEDIA_TIMEOUT_MS = 30_000;

const getAbortError = () => new DOMException("Export cancelled.", "AbortError");

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw getAbortError();
};

const waitForMediaEvent = (
  media: HTMLMediaElement,
  eventName: "loadeddata" | "seeked",
  errorMessage: string,
  signal: AbortSignal,
) => new Promise<void>((resolve, reject) => {
  let timeout = 0;
  const cleanup = () => {
    media.removeEventListener(eventName, complete);
    media.removeEventListener("error", fail);
    signal.removeEventListener("abort", abort);
    window.clearTimeout(timeout);
  };
  const complete = () => {
    cleanup();
    resolve();
  };
  const fail = () => {
    cleanup();
    reject(new Error(errorMessage));
  };
  const abort = () => {
    cleanup();
    reject(getAbortError());
  };
  media.addEventListener(eventName, complete, { once: true });
  media.addEventListener("error", fail, { once: true });
  signal.addEventListener("abort", abort, { once: true });
  timeout = window.setTimeout(fail, MEDIA_TIMEOUT_MS);
  if (signal.aborted) abort();
});

export class OfflineVideoSourcePool {
  private readonly videoByUrl = new Map<string, HTMLVideoElement>();

  async prepare(clips: Clip[], renderer: PixiTimelineRenderer, signal: AbortSignal) {
    throwIfAborted(signal);
    const urls = [...new Set(clips.map((clip) => clip.clipURL))];
    await Promise.all(urls.map(async (url) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      this.videoByUrl.set(url, video);
      const loaded = waitForMediaEvent(
        video,
        "loadeddata",
        "A video asset could not be decoded for export.",
        signal,
      );
      video.src = url;
      video.load();
      await loaded;
    }));
    clips.forEach((clip) => {
      const video = this.videoByUrl.get(clip.clipURL);
      if (!video) throw new Error(`Video source is missing for clip “${clip.name}”.`);
      renderer.registerVideo(clip.id, video);
    });
  }

  async seekToTimelineFrame(clip: Clip, timelineTimeMs: number, signal: AbortSignal) {
    throwIfAborted(signal);
    const video = this.videoByUrl.get(clip.clipURL);
    if (!video) throw new Error(`Video source is missing for clip “${clip.name}”.`);
    const requestedTime = getClipSourceTimeSeconds(clip, timelineTimeMs);
    const maximumTime = Number.isFinite(video.duration)
      ? Math.max(0, video.duration - 0.000_001)
      : requestedTime;
    const targetTime = Math.max(0, Math.min(requestedTime, maximumTime));
    if (!video.seeking
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && Math.abs(video.currentTime - targetTime) < 0.000_1) return video;

    const seeked = waitForMediaEvent(
      video,
      "seeked",
      `Could not seek clip “${clip.name}” while rendering export frames.`,
      signal,
    );
    video.currentTime = targetTime;
    await seeked;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForMediaEvent(
        video,
        "loadeddata",
        `No decoded frame was available for clip “${clip.name}”.`,
        signal,
      );
    }
    throwIfAborted(signal);
    return video;
  }

  destroy() {
    this.videoByUrl.forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    this.videoByUrl.clear();
  }
}
