import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("./src/utils/timelineMath.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const math = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

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

test("snapping only occurs inside the threshold", () => {
  assert.equal(math.snapToPoints(995, [0, 1000, 2000], 10), 1000);
  assert.equal(math.snapToPoints(950, [0, 1000, 2000], 10), 950);
});
