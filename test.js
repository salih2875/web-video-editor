import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const importTypescriptModule = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
};

const math = await importTypescriptModule("./src/utils/timelineMath.ts");
const time = await importTypescriptModule("./src/utils/formatTime.ts");
const frameTiming = await importTypescriptModule("./src/rendering/frameTiming.ts");
const playbackClock = await importTypescriptModule("./src/utils/playbackClock.ts");
const audioFilterGraph = await importTypescriptModule("./src/utils/audioFilterGraph.ts");
const effectCatalog = await importTypescriptModule("./src/effects/effectCatalog.ts");
const colorMatrixEffects = await importTypescriptModule(
  "./src/effects/applyColorMatrixEffect.ts",
);

test("highest z-index item wins an overlap, with later item winning ties", () => {
  const items = [
    { id: "low", zIndex: 1, timelineStart: 0, timelineEnd: 2000 },
    { id: "high", zIndex: 5, timelineStart: 500, timelineEnd: 1500 },
    { id: "tie", zIndex: 5, timelineStart: 500, timelineEnd: 1500 },
  ];
  assert.equal(math.getTopTimelineItem(250, items)?.id, "low");
  assert.equal(math.getTopTimelineItem(750, items)?.id, "tie");
  assert.equal(math.getTopTimelineItem(2000, items), null);
});

test("higher-priority overlap is removed from audible intervals", () => {
  assert.deepEqual(
    math.subtractInterval([{ start: 0, end: 3000 }], { start: 1000, end: 2000 }),
    [{ start: 0, end: 1000 }, { start: 2000, end: 3000 }],
  );
});

test("muted clips do not suppress lower-priority audio", () => {
  const low = {
    id: "low",
    zIndex: 0,
    timelineStart: 0,
    timelineEnd: 3000,
    muted: false,
    volume: 1,
  };
  const muted = {
    id: "muted",
    zIndex: 10,
    timelineStart: 1000,
    timelineEnd: 2000,
    muted: true,
    volume: 1,
  };

  assert.deepEqual(math.getAudibleSegments([low, muted]), [
    { item: low, start: 0, end: 3000 },
  ]);
});

test("audible clips suppress lower-priority audio only while overlapping", () => {
  const low = {
    id: "low",
    zIndex: 0,
    timelineStart: 0,
    timelineEnd: 3000,
    muted: false,
    volume: 1,
  };
  const high = {
    id: "high",
    zIndex: 10,
    timelineStart: 1000,
    timelineEnd: 2000,
    muted: false,
    volume: 1,
  };

  assert.deepEqual(math.getAudibleSegments([low, high]), [
    { item: low, start: 0, end: 1000 },
    { item: low, start: 2000, end: 3000 },
    { item: high, start: 1000, end: 2000 },
  ]);
});

test("snapping only occurs inside the threshold", () => {
  assert.equal(math.snapToPoints(995, [0, 1000, 2000], 10), 1000);
  assert.equal(math.snapToPoints(950, [0, 1000, 2000], 10), 950);
});

test("time formatting handles invalid values and minute boundaries", () => {
  assert.equal(time.formatTime(Number.POSITIVE_INFINITY), "00:00.0");
  assert.equal(time.formatTime(-1), "00:00.0");
  assert.equal(time.formatTime(1.2), "00:01.2");
  assert.equal(time.formatTime(61.99), "01:01.9");
});

test("export frame timestamps are index-derived without cumulative drift", () => {
  assert.equal(frameTiming.getExportFrameCount(1001, 30), 31);
  assert.equal(frameTiming.getFrameTimestampUs(0, 30), 0);
  assert.equal(frameTiming.getFrameTimestampUs(30, 30), 1_000_000);
  assert.equal(
    Array.from({ length: 30 }, (_, index) => frameTiming.getFrameDurationUs(index, 30))
      .reduce((total, duration) => total + duration, 0),
    1_000_000,
  );
});

test("clip source timestamps include trims and timeline offsets", () => {
  const clip = { clipStart: 2_500, timelineStart: 4_000 };
  assert.equal(frameTiming.getClipSourceTimeSeconds(clip, 5_250), 3.75);
});

test("preview clock preserves long frames instead of rewinding playing media", () => {
  assert.equal(playbackClock.advancePlaybackTime(2_000, 10_000, 10_750, false), 2_750);
  assert.equal(playbackClock.advancePlaybackTime(2_000, 10_000, 10_750, true), 2_000);
  assert.equal(playbackClock.advancePlaybackTime(2_000, 10_750, 10_700, false), 2_000);
});

test("audio export filters terminate padding at the timeline duration", () => {
  const mixed = audioFilterGraph.createFinalAudioFilter(["[a0]", "[a1]"], 2);
  assert.equal((mixed.match(/apad=whole_dur=2\.000000/g) ?? []).length, 2);
  assert.match(mixed, /amix=inputs=2:duration=longest:dropout_transition=0/);
  assert.match(mixed, /volume=2/);
  assert.match(mixed, /atrim=start=0:end=2\.000000/);
  assert.doesNotMatch(mixed, /normalize=/);
  assert.doesNotMatch(mixed, /apad,atrim=duration/);

  assert.equal(
    audioFilterGraph.createFinalAudioFilter([], 2),
    "anullsrc=r=48000:cl=stereo,atrim=start=0:end=2.000000,asetpts=N/SR/TB[afinal]",
  );
  assert.doesNotMatch(audioFilterGraph.createFinalAudioFilter([], 2), /anullsrc=.*:d=/);
});

test("effect catalog exposes every PIXI option once in display order", () => {
  assert.deepEqual(
    effectCatalog.EFFECT_DEFINITIONS.map(({ name }) => name),
    [
      "Blur",
      "Noise",
      "Grayscale",
      "Sepia",
      "Vintage",
      "Technicolor",
      "Polaroid",
      "Night",
      "Kodachrome",
    ],
  );
  assert.equal(
    new Set(effectCatalog.EFFECT_DEFINITIONS.map(({ name }) => name)).size,
    effectCatalog.EFFECT_DEFINITIONS.length,
  );
  assert.deepEqual(effectCatalog.EFFECT_CATEGORIES, ["Essentials", "Color", "Film looks"]);
  assert.ok(effectCatalog.EFFECT_DEFINITIONS.every(({ category }) =>
    effectCatalog.EFFECT_CATEGORIES.includes(category)));
  assert.equal(effectCatalog.isEffectName("Polaroid"), true);
  assert.equal(effectCatalog.isEffectName("Unknown legacy effect"), false);
  assert.equal(effectCatalog.isEffectName(null), false);
});

test("offset-based PIXI presets use the matrix-normalizing path", () => {
  const calls = [];
  const target = {
    greyscale: (...args) => calls.push(["greyscale", ...args]),
    sepia: (...args) => calls.push(["sepia", ...args]),
    vintage: (...args) => calls.push(["vintage", ...args]),
    technicolor: (...args) => calls.push(["technicolor", ...args]),
    polaroid: (...args) => calls.push(["polaroid", ...args]),
    night: (...args) => calls.push(["night", ...args]),
    kodachrome: (...args) => calls.push(["kodachrome", ...args]),
  };

  colorMatrixEffects.applyColorMatrixEffect(target, "Vintage");
  colorMatrixEffects.applyColorMatrixEffect(target, "Technicolor");
  colorMatrixEffects.applyColorMatrixEffect(target, "Kodachrome");

  assert.deepEqual(calls, [
    ["vintage", true],
    ["technicolor", true],
    ["kodachrome", true],
  ]);
});
