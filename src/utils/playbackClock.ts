export const advancePlaybackTime = (
  timelineTime: number,
  previousTimestamp: number,
  timestamp: number,
  waitingForMedia: boolean,
) => {
  if (previousTimestamp <= 0 || waitingForMedia) return timelineTime;
  return timelineTime + Math.max(0, timestamp - previousTimestamp);
};
