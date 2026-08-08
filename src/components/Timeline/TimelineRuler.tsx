import React, { useMemo } from "react";
import { formatTime } from "../../utils/formatTime";
import styles from "./TimelineRuler.module.css";

export interface TimelineRulerProps {
  duration: number;
  zoomLevel: number;
  width: number;
  onTimeClick?: (time: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  duration,
  zoomLevel,
  width,
  onTimeClick,
  containerRef,
}) => {
  const timeMarkers = useMemo(() => {
    if (duration <= 0 || width <= 0) return [];

    // Calculate how many pixels per second based on zoom level
    const pixelsPerSecond = (width * zoomLevel) / (duration / 1000);

    // Determine appropriate time intervals based on zoom level with more granular options
    let interval: number;
    let minorInterval: number;

    if (pixelsPerSecond > 200) {
      interval = 0.5; // 0.5 second intervals
      minorInterval = 0.1; // 0.1 second minor intervals
    } else if (pixelsPerSecond > 100) {
      interval = 1; // 1 second intervals
      minorInterval = 0.2; // 0.2 second minor intervals
    } else if (pixelsPerSecond > 50) {
      interval = 2; // 2 second intervals
      minorInterval = 0.5; // 0.5 second minor intervals
    } else if (pixelsPerSecond > 25) {
      interval = 5; // 5 second intervals
      minorInterval = 1; // 1 second minor intervals
    } else if (pixelsPerSecond > 10) {
      interval = 10; // 10 second intervals
      minorInterval = 2; // 2 second minor intervals
    } else if (pixelsPerSecond > 5) {
      interval = 30; // 30 second intervals
      minorInterval = 5; // 5 second minor intervals
    } else if (pixelsPerSecond > 2) {
      interval = 60; // 1 minute intervals
      minorInterval = 10; // 10 second minor intervals
    } else if (pixelsPerSecond > 1) {
      interval = 300; // 5 minute intervals
      minorInterval = 60; // 1 minute minor intervals
    } else {
      interval = 600; // 10 minute intervals
      minorInterval = 300; // 5 minute minor intervals
    }

    const markers = [];

    // Add major markers
    for (let time = 0; time <= duration / 1000; time += interval) {
      const position = (time / (duration / 1000)) * 100; // Percentage position
      const isMajor = true;

      markers.push({
        time,
        position,
        isMajor,
        label: formatTime(time),
        isMinor: false,
      });
    }

    // Add minor markers if there's enough space
    if (pixelsPerSecond > 20) {
      for (let time = 0; time <= duration / 1000; time += minorInterval) {
        // Skip if already a major marker
        if (time % interval === 0) continue;

        const position = (time / (duration / 1000)) * 100;

        markers.push({
          time,
          position,
          isMajor: false,
          label: "", // Minor markers don't show labels
          isMinor: true,
        });
      }
    }

    // Sort markers by position
    return markers.sort((a, b) => a.position - b.position);
  }, [duration, zoomLevel, width]);

  const handleRulerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onTimeClick) return;

    const rect =
      containerRef?.current?.getBoundingClientRect() ||
      event.currentTarget.getBoundingClientRect(); // fallback to self if no container
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const time = percentage * duration;

    onTimeClick(time);
  };

  return (
    <div className={styles.ruler} onClick={handleRulerClick}>
      <div className={styles.rulerTrack}>
        {timeMarkers.map((marker, index) => (
          <div
            key={index}
            className={`${styles.marker} ${
              marker.isMajor
                ? styles.major
                : marker.isMinor
                ? styles.minor
                : styles.tiny
            }`}
            style={{ left: `${marker.position}%` }}
          >
            <div className={styles.markerLine} />
            {marker.isMajor && marker.label && (
              <div className={styles.markerLabel}>{marker.label}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
