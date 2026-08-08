// src/utils/formatTime.ts

export const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) {
    return "00:00.0";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const milliseconds = Math.floor(
    (remainingSeconds - Math.floor(remainingSeconds)) * 10
  ); // Tenths of a second

  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedSeconds = String(Math.floor(remainingSeconds)).padStart(
    2,
    "0"
  );

  return `${formattedMinutes}:${formattedSeconds}.${milliseconds}`;
};
