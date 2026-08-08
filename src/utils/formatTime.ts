export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const secondsWithinMinute = wholeSeconds % 60;
  const tenths = Math.floor(seconds * 10) % 10;

  return `${String(minutes).padStart(2, "0")}:${String(secondsWithinMinute).padStart(2, "0")}.${tenths}`;
};
