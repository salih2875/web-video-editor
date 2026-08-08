import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { AudioClip, Clip, Effect } from "../types/editor";
import { subtractInterval } from "./timelineMath";

let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

export const getFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg?.loaded) return ffmpeg;
  if (loadingPromise) return loadingPromise;
  const instance = ffmpeg ?? new FFmpeg();
  ffmpeg = instance;
  loadingPromise = instance.load().then(() => instance).finally(() => {
    loadingPromise = null;
  });
  return loadingPromise;
};

interface RunTrimParams {
  inputFile: File;
  startTime: number;
  endTime: number;
  outputFilename?: string;
  onProgress?: (progress: number) => void;
  onMessage?: (message: string) => void;
}

export const runTrim = async ({
  inputFile,
  startTime,
  endTime,
  outputFilename = "trimmed_video.mp4",
  onProgress,
  onMessage,
}: RunTrimParams): Promise<string> => {
  const instance = await getFFmpeg();
  const inputName = `input_${inputFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const progressHandler = ({ progress }: { progress: number }) =>
    onProgress?.(Math.max(0, Math.min(1, progress)));
  const logHandler = ({ message }: { message: string }) => onMessage?.(message);
  instance.on("progress", progressHandler);
  instance.on("log", logHandler);

  try {
    await instance.writeFile(inputName, await fetchFile(inputFile));
    await instance.exec([
      "-ss", startTime.toFixed(3),
      "-to", endTime.toFixed(3),
      "-i", inputName,
      "-c", "copy",
      outputFilename,
    ]);
    const data = await instance.readFile(outputFilename);
    if (typeof data === "string") throw new Error("FFmpeg returned an invalid video payload.");
    onProgress?.(1);
    return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "video/mp4" }));
  } finally {
    instance.off("progress", progressHandler);
    instance.off("log", logHandler);
    await Promise.allSettled([
      instance.deleteFile(inputName),
      instance.deleteFile(outputFilename),
    ]);
  }
};

interface TimelineExportOptions {
  clips: Clip[];
  audioClips: AudioClip[];
  effects: Effect[];
  duration: number;
  width: number;
  height: number;
  framerate: number;
  quality: "low" | "medium" | "high";
  onProgress?: (progress: number) => void;
}

interface AudioSegment {
  clip: AudioClip;
  start: number;
  end: number;
}


const getAudibleSegments = (clips: AudioClip[]): AudioSegment[] => {
  const ordered = clips.map((clip, index) => ({ clip, index }));
  return ordered.flatMap(({ clip, index }) => {
    if (clip.muted || clip.volume <= 0) return [];
    const blockers = ordered.filter((candidate) =>
      candidate.clip.id !== clip.id
      && (candidate.clip.zIndex > clip.zIndex
        || (candidate.clip.zIndex === clip.zIndex && candidate.index > index)),
    );
    let segments = [{ start: clip.timelineStart, end: clip.timelineEnd }];
    blockers.forEach(({ clip: blocker }) => {
      segments = subtractInterval(segments, { start: blocker.timelineStart, end: blocker.timelineEnd });
    });
    return segments.map((segment) => ({ clip, ...segment }));
  });
};

export const exportTimeline = async ({
  clips,
  audioClips,
  effects,
  duration,
  width,
  height,
  framerate,
  quality,
  onProgress,
}: TimelineExportOptions): Promise<string> => {
  if (duration <= 0) throw new Error("The timeline is empty.");
  const instance = await getFFmpeg();
  const urls = [...new Set([...clips.map((clip) => clip.clipURL), ...audioClips.map((clip) => clip.clipURL)])];
  const assetNames = new Map<string, string>();
  await Promise.all(urls.map(async (url, index) => {
    const name = `asset_${index}`;
    assetNames.set(url, name);
    await instance.writeFile(name, await fetchFile(url));
  }));

  const args: string[] = [];
  const filters: string[] = [];
  let inputIndex = 0;
  const seconds = duration / 1000;
  filters.push(`color=c=black:s=${width}x${height}:r=${framerate}:d=${seconds.toFixed(3)}[base]`);
  let videoBase = "base";
  const orderedVideo = clips.map((clip, index) => ({ clip, index }))
    .sort((left, right) => left.clip.zIndex - right.clip.zIndex || left.index - right.index);
  orderedVideo.forEach(({ clip }, index) => {
    args.push("-i", assetNames.get(clip.clipURL)!);
    const start = clip.clipStart / 1000;
    const end = clip.clipEnd / 1000;
    const timelineStart = clip.timelineStart / 1000;
    const timelineEnd = clip.timelineEnd / 1000;
    const effectNames = effects.filter((effect) => effect.id === clip.id).map((effect) => effect.name);
    const effectFilter = [
      effectNames.includes("Blur") ? "boxblur=5:1" : "",
      effectNames.includes("Noise") ? "noise=alls=12:allf=t" : "",
    ].filter(Boolean).join(",");
    const transform = clip.transform;
    const fitScale = transform.fit === "cover"
      ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
    const transformFilter = transform.rotation
      ? `,rotate=${(transform.rotation * Math.PI / 180).toFixed(6)}:fillcolor=black`
      : "";
    filters.push(
      `[${inputIndex}:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS+${timelineStart.toFixed(3)}/TB,${fitScale}${transformFilter}${effectFilter ? `,${effectFilter}` : ""},format=yuv420p[v${index}]`,
    );
    filters.push(`[${videoBase}][v${index}]overlay=0:0:enable='between(t,${timelineStart.toFixed(3)},${timelineEnd.toFixed(3)})'[vo${index}]`);
    videoBase = `vo${index}`;
    inputIndex += 1;
  });

  const audioLabels: string[] = [];
  getAudibleSegments(audioClips).forEach((segment, index) => {
    args.push("-i", assetNames.get(segment.clip.clipURL)!);
    const sourceStart = (segment.clip.clipStart + segment.start - segment.clip.timelineStart) / 1000;
    const sourceEnd = sourceStart + (segment.end - segment.start) / 1000;
    const delay = Math.round(segment.start);
    const filtersForSegment = [
      `atrim=start=${sourceStart.toFixed(3)}:end=${sourceEnd.toFixed(3)}`,
      "asetpts=PTS-STARTPTS",
      `volume=${segment.clip.volume.toFixed(3)}`,
      `adelay=${delay}|${delay}`,
    ];
    if (segment.start === segment.clip.timelineStart && segment.clip.fadeIn > 0) {
      filtersForSegment.push(`afade=t=in:st=0:d=${(segment.clip.fadeIn / 1000).toFixed(3)}`);
    }
    if (segment.end === segment.clip.timelineEnd && segment.clip.fadeOut > 0) {
      const fadeStart = Math.max(0, (segment.end - segment.start - segment.clip.fadeOut) / 1000);
      filtersForSegment.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${(segment.clip.fadeOut / 1000).toFixed(3)}`);
    }
    filters.push(`[${inputIndex}:a]${filtersForSegment.join(",")}[a${index}]`);
    audioLabels.push(`[a${index}]`);
    inputIndex += 1;
  });
  if (audioLabels.length) {
    filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0,apad,atrim=duration=${seconds.toFixed(3)}[afinal]`);
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds.toFixed(3)}[afinal]`);
  }

  const output = "timeline-export.mp4";
  const progressHandler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  instance.on("progress", progressHandler);
  try {
    const crf = quality === "high" ? "18" : quality === "medium" ? "23" : "28";
    await instance.exec([
      ...args,
      "-filter_complex", filters.join(";"),
      "-map", `[${videoBase}]`,
      "-map", "[afinal]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", crf,
      "-r", String(framerate),
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
      output,
    ]);
    const data = await instance.readFile(output);
    if (typeof data === "string") throw new Error("FFmpeg returned invalid export data.");
    onProgress?.(1);
    return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "video/mp4" }));
  } finally {
    instance.off("progress", progressHandler);
    await Promise.allSettled([
      ...[...assetNames.values()].map((name) => instance.deleteFile(name)),
      instance.deleteFile(output),
    ]);
  }
};
