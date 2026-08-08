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
