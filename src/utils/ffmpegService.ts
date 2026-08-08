import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { AudioClip, Clip, Effect } from "../types/editor";
import { getAudibleSegments } from "./timelineMath";

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
  const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const urls = [...new Set([...clips.map((clip) => clip.clipURL), ...audioClips.map((clip) => clip.clipURL)])];
  const assetNames = new Map<string, string>();
  try {
    await Promise.all(urls.map(async (url, index) => {
      const name = `${jobId}_asset_${index}`;
      assetNames.set(url, name);
      await instance.writeFile(name, await fetchFile(url));
    }));
  } catch (error) {
    await Promise.allSettled(
      [...assetNames.values()].map((name) => instance.deleteFile(name)),
    );
    throw error;
  }
  const getAssetName = (url: string) => {
    const name = assetNames.get(url);
    if (!name) throw new Error("An export asset was not loaded.");
    return name;
  };

  const args: string[] = [];
  const filters: string[] = [];
  let inputIndex = 0;
  const seconds = duration / 1000;
  filters.push(`color=c=black:s=${width}x${height}:r=${framerate}:d=${seconds.toFixed(3)}[base]`);
  let videoBase = "base";
  const orderedVideo = clips.map((clip, index) => ({ clip, index }))
    .sort((left, right) => left.clip.zIndex - right.clip.zIndex || left.index - right.index);
  orderedVideo.forEach(({ clip }, index) => {
    args.push("-i", getAssetName(clip.clipURL));
    const start = clip.clipStart / 1000;
    const end = clip.clipEnd / 1000;
    const timelineStart = clip.timelineStart / 1000;
    const timelineEnd = clip.timelineEnd / 1000;
    const effectNames = effects
      .filter((effect) => effect.clipId === clip.id)
      .map((effect) => effect.name);
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
    args.push("-i", getAssetName(segment.item.clipURL));
    const sourceStart = (segment.item.clipStart + segment.start - segment.item.timelineStart) / 1000;
    const sourceEnd = sourceStart + (segment.end - segment.start) / 1000;
    const delay = Math.round(segment.start);
    const filtersForSegment = [
      `atrim=start=${sourceStart.toFixed(3)}:end=${sourceEnd.toFixed(3)}`,
      "asetpts=PTS-STARTPTS",
      `volume=${segment.item.volume.toFixed(3)}`,
      `adelay=${delay}|${delay}`,
    ];
    if (segment.start === segment.item.timelineStart && segment.item.fadeIn > 0) {
      filtersForSegment.push(`afade=t=in:st=0:d=${(segment.item.fadeIn / 1000).toFixed(3)}`);
    }
    if (segment.end === segment.item.timelineEnd && segment.item.fadeOut > 0) {
      const fadeStart = Math.max(0, (segment.end - segment.start - segment.item.fadeOut) / 1000);
      filtersForSegment.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${(segment.item.fadeOut / 1000).toFixed(3)}`);
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

  const output = `${jobId}.mp4`;
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
