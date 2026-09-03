import { useMemo, type MouseEvent } from "react";
import { formatTime } from "../../utils/formatTime";
import styles from "./TimelineRuler.module.css";

interface TimelineRulerProps {
  duration: number;
  width: number;
  onTimeClick?: (time: number) => void;
}

interface MarkerInterval {
  minimumPixelsPerSecond: number;
  majorSeconds: number;
  minorSeconds: number;
}

const FALLBACK_MARKER_INTERVAL: MarkerInterval = {
  minimumPixelsPerSecond: 0,
  majorSeconds: 600,
  minorSeconds: 300,
};

const MARKER_INTERVALS: readonly MarkerInterval[] = [
  { minimumPixelsPerSecond: 200, majorSeconds: 0.5, minorSeconds: 0.1 },
  { minimumPixelsPerSecond: 100, majorSeconds: 1, minorSeconds: 0.2 },
  { minimumPixelsPerSecond: 50, majorSeconds: 2, minorSeconds: 0.5 },
  { minimumPixelsPerSecond: 25, majorSeconds: 5, minorSeconds: 1 },
  { minimumPixelsPerSecond: 10, majorSeconds: 10, minorSeconds: 2 },
  { minimumPixelsPerSecond: 5, majorSeconds: 30, minorSeconds: 5 },
  { minimumPixelsPerSecond: 2, majorSeconds: 60, minorSeconds: 10 },
  { minimumPixelsPerSecond: 1, majorSeconds: 300, minorSeconds: 60 },
  FALLBACK_MARKER_INTERVAL,
];

export const TimelineRuler = ({ duration, width, onTimeClick }: TimelineRulerProps) => {
  const markers = useMemo(() => {
    if (duration <= 0 || width <= 0) return [];
    const durationSeconds = duration / 1000;
    const pixelsPerSecond = width / durationSeconds;
    const interval = MARKER_INTERVALS.find(
      (candidate) => pixelsPerSecond > candidate.minimumPixelsPerSecond,
    ) ?? FALLBACK_MARKER_INTERVAL;
    const showMinorMarkers = pixelsPerSecond > 20;
    const step = showMinorMarkers ? interval.minorSeconds : interval.majorSeconds;
    const markerCount = Math.floor(durationSeconds / step);

    return Array.from({ length: markerCount + 1 }, (_, index) => {
      const time = index * step;
      const majorRatio = time / interval.majorSeconds;
      const isMajor = Math.abs(majorRatio - Math.round(majorRatio)) < 1e-8;
      return {
        time,
        position: time / durationSeconds * 100,
        isMajor,
      };
    });
  }, [duration, width]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onTimeClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onTimeClick(percentage * duration);
  };

  return (
    <div className={styles.ruler} onClick={handleClick}>
      <div className={styles.rulerTrack}>
        {markers.map((marker) => (
          <div
            key={marker.time}
            className={`${styles.marker} ${marker.isMajor ? styles.major : styles.minor}`}
            style={{ left: `${marker.position}%` }}
          >
            <div className={styles.markerLine} />
            {marker.isMajor && (
              <div className={styles.markerLabel}>{formatTime(marker.time)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
