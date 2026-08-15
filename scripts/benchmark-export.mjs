import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const SAMPLE = resolve("test-video/trimmed_MaxOKE_ - 1771219500278395106.mp4");
const OUTPUT_DIR = join(tmpdir(), "online-video-editor-export-benchmark");
const DURATION_SECONDS = 1.672;
const FRAMERATE = 30;
const RUNS = 7;

mkdirSync(OUTPUT_DIR, { recursive: true });

const runFFmpeg = (args) => {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (${result.status}): ${result.stderr || result.stdout}`);
  }
};

const videoInput = join(OUTPUT_DIR, "pixi.h264");
runFFmpeg([
  "-i", SAMPLE,
  "-an",
  "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30",
  "-c:v", "libx264",
  "-b:v", "9000000",
  "-f", "h264",
  videoInput,
]);

const filter = [
  "[0:a]atrim=start=0:end=1.672000,asetpts=PTS-STARTPTS,volume='if(isnan(t),0,1.000000)':eval=frame,adelay=0.000|0.000[a0]",
  "[a0]apad=whole_dur=1.672000,atrim=start=0:end=1.672000[mix0]",
  "[mix0]amix=inputs=1:duration=longest:dropout_transition=0,volume=1,atrim=start=0:end=1.672000,asetpts=N/SR/TB[afinal]",
].join(";");

const runCurrentPipeline = () => {
  const probeOutput = join(OUTPUT_DIR, "probe.wav");
  const audioOutput = join(OUTPUT_DIR, "audio.m4a");
  const output = join(OUTPUT_DIR, "current.mp4");
  runFFmpeg(["-i", SAMPLE, "-map", "0:a:0", "-frames:a", "1", "-c:a", "pcm_s16le", probeOutput]);
  runFFmpeg([
    "-i", SAMPLE,
    "-filter_complex", filter,
    "-map", "[afinal]",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", DURATION_SECONDS.toFixed(6),
    audioOutput,
  ]);
  runFFmpeg([
    "-fflags", "+genpts",
    "-r", String(FRAMERATE),
    "-f", "h264",
    "-i", videoInput,
    "-i", audioOutput,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c", "copy",
    "-t", DURATION_SECONDS.toFixed(6),
    output,
  ]);
  return output;
};

const runCombinedPipeline = () => {
  const output = join(OUTPUT_DIR, "combined.mp4");
  const combinedFilter = filter.replaceAll("[0:a]", "[1:a]");
  runFFmpeg([
    "-fflags", "+genpts",
    "-r", String(FRAMERATE),
    "-f", "h264",
    "-i", videoInput,
    "-i", SAMPLE,
    "-filter_complex", combinedFilter,
    "-map", "0:v:0",
    "-map", "[afinal]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", DURATION_SECONDS.toFixed(6),
    output,
  ]);
  return output;
};

const measure = (operation) => {
  const samples = [];
  let output = "";
  for (let index = 0; index <= RUNS; index += 1) {
    const start = performance.now();
    output = operation();
    const elapsed = performance.now() - start;
    if (index > 0) samples.push(elapsed);
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    runs: RUNS,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    samplesMs: samples,
    output,
    outputBytes: statSync(output).size,
  };
};

const validateOutput = (output) => {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-i", output], { encoding: "utf8" });
  const details = `${result.stderr}\n${result.stdout}`;
  const durationMatch = details.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!durationMatch
    || !details.includes("Video: h264")
    || !details.includes("1920x1080")
    || !details.includes("30 fps")
    || !details.includes("Audio: aac")) {
    throw new Error(`Export validation failed:\n${details}`);
  }
  const durationSeconds = Number(durationMatch[1]) * 3600
    + Number(durationMatch[2]) * 60
    + Number(durationMatch[3]);
  if (Math.abs(durationSeconds - DURATION_SECONDS) > 0.05) {
    throw new Error(`Unexpected export duration: ${durationSeconds}s`);
  }
  runFFmpeg(["-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "NUL"]);
  return {
    durationSeconds,
    resolution: "1920x1080",
    framerate: FRAMERATE,
    videoCodec: "h264",
    audioCodec: "aac",
    decodesWithoutError: true,
  };
};

const current = measure(runCurrentPipeline);
const combined = measure(runCombinedPipeline);
const validation = {
  current: validateOutput(current.output),
  combined: validateOutput(combined.output),
};
console.log(JSON.stringify({
  workload: {
    sample: SAMPLE,
    durationSeconds: DURATION_SECONDS,
    resolution: "1920x1080",
    framerate: FRAMERATE,
    videoBitrate: 9_000_000,
    audioBitrate: 192_000,
  },
  current,
  combined,
  validation,
  medianChangePercent: (combined.medianMs / current.medianMs - 1) * 100,
}, null, 2));
