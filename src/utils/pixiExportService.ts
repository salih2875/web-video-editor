import type { AudioClip, Clip, Effect, TextClip } from "../types/editor";
import { OfflineVideoSourcePool } from "../rendering/OfflineVideoSourcePool";
import {
  getExportFrameCount,
  getFrameDurationUs,
  getFrameTimestampMs,
  getFrameTimestampUs,
} from "../rendering/frameTiming";
import { PixiTimelineRenderer } from "../rendering/PixiTimelineRenderer";
import { getTopTimelineItem } from "./timelineMath";
import { getFFmpeg, muxTimeline, type MuxPhase } from "./ffmpegService";

type Quality = "low" | "medium" | "high";
export type ExportPhase = "preparing"
  | "rendering"
  | "loading-engine"
  | "transferring"
  | "mixing-audio"
  | "muxing"
  | "finalizing";

interface TimelineExportOptions {
  clips: Clip[];
  audioClips: AudioClip[];
  effects: Effect[];
  textClips: TextClip[];
  duration: number;
  width: number;
  height: number;
  framerate: number;
  quality: Quality;
  signal: AbortSignal;
  onProgress?: (progress: number, phase: ExportPhase) => void;
}

interface RenderVideoOptions {
  clips: Clip[];
  effects: Effect[];
  textClips: TextClip[];
  duration: number;
  width: number;
  height: number;
  framerate: number;
  quality: Quality;
  signal: AbortSignal;
  onProgress?: (progress: number) => void;
}

const MAX_ENCODER_QUEUE_SIZE = 12;
const AVC_CODECS = ["avc1.64002a", "avc1.4d002a", "avc1.42002a"];

const getAbortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Export cancelled.", "AbortError");

const getBitrate = (quality: Quality) => {
  if (quality === "high") return 14_000_000;
  if (quality === "medium") return 9_000_000;
  return 5_000_000;
};

const mergeChunks = (chunks: Uint8Array[], byteLength: number) => {
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const waitForEncoderCapacity = (
  encoder: VideoEncoder,
  signal: AbortSignal,
) => {
  if (encoder.encodeQueueSize < MAX_ENCODER_QUEUE_SIZE) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      encoder.removeEventListener("dequeue", handleDequeue);
      signal.removeEventListener("abort", handleAbort);
    };
    const handleDequeue = () => {
      if (encoder.encodeQueueSize >= MAX_ENCODER_QUEUE_SIZE) return;
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(getAbortError(signal));
    };
    encoder.addEventListener("dequeue", handleDequeue);
    signal.addEventListener("abort", handleAbort, { once: true });
    handleDequeue();
  });
};

const MUX_PHASE_PROGRESS: Record<MuxPhase, number> = {
  transferring: 0.86,
  "mixing-audio": 0.88,
  muxing: 0.96,
  finalizing: 0.99,
};

const getSupportedEncoderConfig = async (
  width: number,
  height: number,
  framerate: number,
  quality: Quality,
  signal: AbortSignal,
) => {
  for (const codec of AVC_CODECS) {
    signal.throwIfAborted();
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      displayWidth: width,
      displayHeight: height,
      framerate,
      bitrate: getBitrate(quality),
      bitrateMode: "variable",
      hardwareAcceleration: "prefer-hardware",
      latencyMode: "quality",
      avc: { format: "annexb" },
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) return support.config ?? config;
  }
  throw new Error(`H.264 WebCodecs export is not supported at ${width}×${height}.`);
};

const renderTimelineVideo = async ({
  clips,
  effects,
  textClips,
  duration,
  width,
  height,
  framerate,
  quality,
  signal,
  onProgress,
}: RenderVideoOptions) => {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error("This browser does not support WebCodecs video export.");
  }

  const config = await getSupportedEncoderConfig(
    width,
    height,
    framerate,
    quality,
    signal,
  );

  const renderer = new PixiTimelineRenderer({ width, height });
  const sources = new OfflineVideoSourcePool();
  const encodedChunks: Uint8Array[] = [];
  let encodedByteLength = 0;
  const encoderError: { current: Error | null } = { current: null };
  const throwIfEncoderFailed = () => {
    if (encoderError.current) throw encoderError.current;
  };
  let encoder: VideoEncoder | null = null;

  try {
    signal.throwIfAborted();
    encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        encodedChunks.push(data);
        encodedByteLength += data.byteLength;
      },
      error: (error) => {
        encoderError.current = error;
      },
    });
    encoder.configure(config);
    await sources.prepare(clips, renderer, signal);
    const frameCount = getExportFrameCount(duration, framerate);
    const keyFrameInterval = Math.max(1, Math.round(framerate * 2));
    let lastReportedPercent = -1;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      signal.throwIfAborted();
      const timelineTime = getFrameTimestampMs(frameIndex, framerate);
      const activeClip = getTopTimelineItem(timelineTime, clips);
      if (activeClip) await sources.seekToTimelineFrame(activeClip, timelineTime, signal);

      const result = renderer.renderTimelineFrame(timelineTime, clips, effects, textClips, activeClip);
      if (activeClip && (!result.rendered || result.activeClip?.id !== activeClip.id)) {
        throw new Error(`PIXI could not render a decoded frame for clip “${activeClip.name}”.`);
      }

      const frame = new VideoFrame(renderer.canvas, {
        timestamp: getFrameTimestampUs(frameIndex, framerate),
        duration: getFrameDurationUs(frameIndex, framerate),
      });
      try {
        encoder.encode(frame, { keyFrame: frameIndex % keyFrameInterval === 0 });
      } finally {
        frame.close();
      }
      throwIfEncoderFailed();
      await waitForEncoderCapacity(encoder, signal);
      throwIfEncoderFailed();
      const progress = (frameIndex + 1) / frameCount;
      const progressPercent = Math.floor(progress * 100);
      if (progressPercent !== lastReportedPercent || frameIndex + 1 === frameCount) {
        lastReportedPercent = progressPercent;
        onProgress?.(progress);
      }
    }

    await encoder.flush();
    throwIfEncoderFailed();
    signal.throwIfAborted();
    return mergeChunks(encodedChunks, encodedByteLength);
  } finally {
    if (encoder && encoder.state !== "closed") encoder.close();
    renderer.destroy();
    sources.destroy();
  }
};

export const exportTimeline = async ({
  clips,
  audioClips,
  effects,
  textClips,
  duration,
  width,
  height,
  framerate,
  quality,
  signal,
  onProgress,
}: TimelineExportOptions): Promise<string> => {
  if (duration <= 0 || !clips.length) throw new Error("The video timeline is empty.");
  onProgress?.(0, "preparing");
  const ffmpegPromise = getFFmpeg();
  void ffmpegPromise.catch(() => undefined);
  const encodedVideo = await renderTimelineVideo({
    clips,
    effects,
    textClips,
    duration,
    width,
    height,
    framerate,
    quality,
    signal,
    onProgress: (progress) => onProgress?.(progress * 0.85, "rendering"),
  });
  signal.throwIfAborted();
  onProgress?.(0.85, "loading-engine");
  await ffmpegPromise;
  const result = await muxTimeline({
    encodedVideo,
    audioClips,
    duration,
    framerate,
    signal,
    onProgress: (progress) => onProgress?.(0.88 + progress * 0.1, "muxing"),
    onPhase: (phase) => onProgress?.(MUX_PHASE_PROGRESS[phase], phase),
  });
  onProgress?.(1, "finalizing");
  return result;
};
