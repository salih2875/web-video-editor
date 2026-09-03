import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import type { AudioClip } from "../types/editor";
import { createFinalAudioFilter } from "./audioFilterGraph";
import { getAudibleSegments } from "./timelineMath";

type FFmpeg = ReturnType<typeof createFFmpeg>;
const MAX_CONCURRENT_ASSET_LOADS = 2;

const ffmpegRef: { current: FFmpeg | null } = { current: null };
let isLoading = false;
let loadingPromise: Promise<FFmpeg> | null = null;

export const getFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpegRef.current) {
    console.log("FFmpeg already loaded.");
    return ffmpegRef.current;
  }
  if (isLoading && loadingPromise) {
    console.log("FFmpeg loading in progress, awaiting existing promise.");
    return loadingPromise;
  }

  console.log("Loading FFmpeg...");
  isLoading = true;
  const ffmpeg = createFFmpeg({ log: false });
  loadingPromise = (async () => {
    try {
      await ffmpeg.load();
      console.log("FFmpeg loaded successfully.");
      ffmpegRef.current = ffmpeg;
      return ffmpeg;
    } catch (error) {
      console.error("Error loading FFmpeg:", error);
      throw error;
    } finally {
      isLoading = false;
      loadingPromise = null;
    }
  })();
  return loadingPromise;
};

interface TimelineMuxOptions {
  encodedVideo: Uint8Array;
  audioClips: AudioClip[];
  duration: number;
  framerate: number;
  signal: AbortSignal;
  onProgress?: (progress: number) => void;
  onPhase?: (phase: MuxPhase) => void;
}

export type MuxPhase = "transferring" | "mixing-audio" | "muxing" | "finalizing";

interface AudioSegment {
  item: AudioClip;
  start: number;
  end: number;
}

const fetchAsset = async (url: string, signal: AbortSignal) => {
  signal.throwIfAborted();
  const data = await fetchFile(url);
  signal.throwIfAborted();
  return data;
};

const loadAssetsIntoFFmpeg = async (
  ffmpeg: FFmpeg,
  urls: string[],
  getName: (url: string, index: number) => string,
  signal: AbortSignal,
) => {
  let nextIndex = 0;
  const loadNext = async () => {
    while (nextIndex < urls.length) {
      const index = nextIndex;
      nextIndex += 1;
      const url = urls[index];
      if (url === undefined) return;
      const data = await fetchAsset(url, signal);
      signal.throwIfAborted();
      ffmpeg.FS("writeFile", getName(url, index), data);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_ASSET_LOADS, urls.length) },
      loadNext,
    ),
  );
};

const createVolumeFilter = (
  clip: AudioClip,
  segmentStart: number,
) => {
  const localStartSeconds = (segmentStart - clip.timelineStart) / 1000;
  const remainingAtStartSeconds = (clip.timelineEnd - segmentStart) / 1000;
  const factors = [Math.max(0, Math.min(1, clip.volume)).toFixed(6)];
  if (clip.fadeIn > 0) {
    factors.push(
      `min(1,max(0,(t+${localStartSeconds.toFixed(6)})/${(clip.fadeIn / 1000).toFixed(6)}))`,
    );
  }
  if (clip.fadeOut > 0) {
    factors.push(
      `min(1,max(0,(${remainingAtStartSeconds.toFixed(6)}-t)/${(clip.fadeOut / 1000).toFixed(6)}))`,
    );
  }
  return `volume='if(isnan(t),0,${factors.join("*")})':eval=frame`;
};

const createAudioFilters = (
  segments: AudioSegment[],
  seconds: number,
  inputIndexByUrl: Map<string, number>,
) => {
  const filters: string[] = [];
  const audioLabels: string[] = [];
  const sourceLabelBySegment = new Map<number, string>();
  const segmentsByUrl = new Map<string, Array<{ segment: AudioSegment; index: number }>>();

  segments.forEach((segment, index) => {
    const entries = segmentsByUrl.get(segment.item.clipURL) ?? [];
    entries.push({ segment, index });
    segmentsByUrl.set(segment.item.clipURL, entries);
  });
  segmentsByUrl.forEach((entries, url) => {
    const inputIndex = inputIndexByUrl.get(url);
    if (inputIndex === undefined) throw new Error("An audio input was not prepared.");
    if (entries.length === 1) {
      const entry = entries[0];
      if (!entry) throw new Error("An audio segment was not prepared.");
      sourceLabelBySegment.set(entry.index, `[${inputIndex}:a]`);
      return;
    }
    const labels = entries.map(({ index }) => `[source${index}]`);
    filters.push(`[${inputIndex}:a]asplit=${entries.length}${labels.join("")}`);
    entries.forEach(({ index }) => sourceLabelBySegment.set(index, `[source${index}]`));
  });

  segments.forEach((segment, index) => {
    const sourceLabel = sourceLabelBySegment.get(index);
    if (!sourceLabel) throw new Error("An audio filter source was not prepared.");
    const sourceStart = (segment.item.clipStart + segment.start - segment.item.timelineStart) / 1000;
    const sourceEnd = sourceStart + (segment.end - segment.start) / 1000;
    const delay = Math.max(0, segment.start).toFixed(3);
    const segmentFilters = [
      `atrim=start=${sourceStart.toFixed(6)}:end=${sourceEnd.toFixed(6)}`,
      "asetpts=PTS-STARTPTS",
      createVolumeFilter(segment.item, segment.start),
      `adelay=${delay}|${delay}`,
    ];
    filters.push(`${sourceLabel}${segmentFilters.join(",")}[a${index}]`);
    audioLabels.push(`[a${index}]`);
  });

  filters.push(createFinalAudioFilter(audioLabels, seconds));
  return filters;
};

export const muxTimeline = async ({
  encodedVideo,
  audioClips,
  duration,
  framerate,
  signal,
  onProgress,
  onPhase,
}: TimelineMuxOptions): Promise<string> => {
  signal.throwIfAborted();
  const instance = await getFFmpeg();
  signal.throwIfAborted();
  const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const videoInput = `${jobId}_pixi.h264`;
  const output = `${jobId}.mp4`;
  const audibleSegments = getAudibleSegments(audioClips);
  const audioUrls = [...new Set(audibleSegments.map((segment) => segment.item.clipURL))];
  const assetNames = new Map<string, string>();
  const filesToDelete = [videoInput, output];
  const seconds = duration / 1000;
  let commandLogs: string[] = [];
  const stopOnAbort = () => {
    instance.exit();
    if (ffmpegRef.current === instance) ffmpegRef.current = null;
    isLoading = false;
    loadingPromise = null;
  };
  const progressHandler = ({ ratio }: { ratio: number }) => {
    if (!Number.isFinite(ratio)) return;
    onProgress?.(Math.max(0, Math.min(1, ratio)));
  };
  const logHandler = ({ type, message }: { type: string; message: string }) => {
    console.log("[ffmpeg]", message);
    if (type === "fferr" && message.trim()) {
      commandLogs = [...commandLogs.slice(-7), message.trim()];
    }
  };
  const runCommand = async (
    args: string[],
    expectedOutput: string,
    failureMessage: string,
  ) => {
    commandLogs = [];
    try {
      await instance.run(...args);
      const data = instance.FS("readFile", expectedOutput);
      if (!data.byteLength) throw new Error("FFmpeg created an empty output file.");
      return data;
    } catch (error) {
      const detail = commandLogs.slice(-6).join(" ");
      const failure = new Error(`${failureMessage}${detail ? ` ${detail}` : ""}`);
      Object.defineProperty(failure, "cause", { value: error, configurable: true });
      throw failure;
    }
  };
  try {
    signal.addEventListener("abort", stopOnAbort, { once: true });
    if (signal.aborted) stopOnAbort();
    onPhase?.("transferring");
    instance.FS("writeFile", videoInput, encodedVideo);
    await loadAssetsIntoFFmpeg(instance, audioUrls, (url, index) => {
      const name = `${jobId}_audio_${index}`;
      assetNames.set(url, name);
      filesToDelete.push(name);
      return name;
    }, signal);
    instance.setProgress(progressHandler);
    instance.setLogger(logHandler);

    const audioArgs: string[] = [];
    const inputIndexByUrl = new Map<string, number>();
    audioUrls.forEach((url, index) => {
      const name = assetNames.get(url);
      if (!name) throw new Error("An audio export asset was not loaded.");
      // Input zero is the already encoded PIXI video stream.
      inputIndexByUrl.set(url, index + 1);
      audioArgs.push("-i", name);
    });
    const filters = createAudioFilters(audibleSegments, seconds, inputIndexByUrl);

    onPhase?.("mixing-audio");
    const data = await runCommand(
      [
        "-fflags", "+genpts",
        "-r", String(framerate),
        "-f", "h264",
        "-i", videoInput,
        ...audioArgs,
        "-filter_complex", filters.join(";"),
        "-map", "0:v:0",
        "-map", "[afinal]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", seconds.toFixed(6),
        output,
      ],
      output,
      "FFmpeg could not render timeline audio and mux the export.",
    );
    onPhase?.("finalizing");
    return URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
  } catch (error) {
    if (signal.aborted) throw new DOMException("Export cancelled.", "AbortError");
    throw error;
  } finally {
    signal.removeEventListener("abort", stopOnAbort);
    if (instance.isLoaded()) {
      filesToDelete.forEach((name) => {
        try {
          instance.FS("unlink", name);
        } catch {
          // File was never created or was already removed.
        }
      });
    }
  }
};
