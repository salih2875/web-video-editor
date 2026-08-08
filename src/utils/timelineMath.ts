export interface TimelineItem {
  id: string;
  zIndex: number;
  timelineStart: number;
  timelineEnd: number;
}

export const getTopTimelineItem = <T extends TimelineItem>(time: number, items: T[]): T | null =>
  items.reduce<T | null>((top, item) => {
    if (time < item.timelineStart || time >= item.timelineEnd) return top;
    return !top || item.zIndex >= top.zIndex ? item : top;
  }, null);

export const subtractInterval = (
  segments: Array<{ start: number; end: number }>,
  blocker: { start: number; end: number },
) => segments.flatMap((segment) => {
  if (blocker.end <= segment.start || blocker.start >= segment.end) return [segment];
  const result: Array<{ start: number; end: number }> = [];
  if (blocker.start > segment.start) result.push({ start: segment.start, end: blocker.start });
  if (blocker.end < segment.end) result.push({ start: blocker.end, end: segment.end });
  return result;
});

export const snapToPoints = (candidate: number, points: number[], threshold: number) =>
  points.reduce(
    (best, point) => {
      const distance = Math.abs(point - candidate);
      return distance < best.distance && distance <= threshold
        ? { value: point, distance }
        : best;
    },
    { value: candidate, distance: Number.POSITIVE_INFINITY },
  ).value;
