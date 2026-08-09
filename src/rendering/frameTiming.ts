import type { Clip } from "../types/editor";

const MICROSECONDS_PER_SECOND = 1_000_000;

export const getExportFrameCount = (durationMs: number, framerate: number) => {
  if (durationMs <= 0 || framerate <= 0) return 0;
  return Math.ceil(durationMs * framerate / 1000);
};

export const getFrameTimestampMs = (frameIndex: number, framerate: number) =>
  frameIndex * 1000 / framerate;

export const getFrameTimestampUs = (frameIndex: number, framerate: number) =>
  Math.round(frameIndex * MICROSECONDS_PER_SECOND / framerate);

export const getFrameDurationUs = (frameIndex: number, framerate: number) =>
  getFrameTimestampUs(frameIndex + 1, framerate) - getFrameTimestampUs(frameIndex, framerate);

export const getClipSourceTimeSeconds = (clip: Clip, timelineTimeMs: number) =>
  (clip.clipStart + timelineTimeMs - clip.timelineStart) / 1000;
