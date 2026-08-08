export interface TimelineItem {
  id: string;
  zIndex: number;
  timelineStart: number;
  timelineEnd: number;
}

interface AudibleTimelineItem extends TimelineItem {
  muted: boolean;
  volume: number;
}

export const getTopTimelineItem = <T extends TimelineItem>(
  time: number,
  items: T[],
  isEligible?: (item: T) => boolean,
): T | null =>
  items.reduce<T | null>((top, item) => {
    if ((isEligible && !isEligible(item))
      || time < item.timelineStart
      || time >= item.timelineEnd) return top;
    return !top || item.zIndex >= top.zIndex ? item : top;
  }, null);

const isAudible = (item: AudibleTimelineItem) => !item.muted && item.volume > 0;

export const getTopAudibleTimelineItem = <T extends AudibleTimelineItem>(
  time: number,
  items: T[],
) => getTopTimelineItem(time, items, isAudible);

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

export const getAudibleSegments = <T extends AudibleTimelineItem>(items: T[]) => {
  const audibleItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isAudible(item));

  return audibleItems.flatMap(({ item, index }) => {
    const blockers = audibleItems.filter((candidate) =>
      candidate.item.id !== item.id
      && (candidate.item.zIndex > item.zIndex
        || (candidate.item.zIndex === item.zIndex && candidate.index > index)),
    );
    let segments = [{ start: item.timelineStart, end: item.timelineEnd }];
    for (const blocker of blockers) {
      segments = subtractInterval(segments, {
        start: blocker.item.timelineStart,
        end: blocker.item.timelineEnd,
      });
    }
    return segments.map((segment) => ({ item, ...segment }));
  });
};

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
