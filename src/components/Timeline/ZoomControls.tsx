import React from 'react';
import styles from './ZoomControls.module.css';

export interface ZoomControlsProps {
  zoomLevel: number;
  minZoom: number;
  maxZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomToFit: () => void;
  onZoomChange?: (zoom: number) => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomLevel,
  minZoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToFit,
  onZoomChange,
}) => {
  const zoomPercentage = Math.round(zoomLevel * 100);

  return (
    <div className={styles.zoomControls}>
      <div className={styles.zoomInfo}>
        <span className={styles.zoomLevel}>{zoomPercentage}%</span>
      </div>
      
      <div className={styles.zoomButtons}>
        <button
          className={styles.zoomButton}
          onClick={onZoomOut}
          disabled={zoomLevel <= minZoom}
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13H5v-2h14v2z"/>
          </svg>
        </button>
        
        <button
          className={styles.zoomButton}
          onClick={onZoomReset}
          title="Reset Zoom"
          aria-label="Reset Zoom"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </button>
        
        <button
          className={styles.zoomButton}
          onClick={onZoomToFit}
          title="Zoom to Fit"
          aria-label="Zoom to Fit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 9H3V7h6v2zm0 4H3v-2h6v2zm0 4H3v-2h6v2zm8-12h-6v2h6V5zm0 4h-6v2h6V9zm0 4h-6v2h6v-2zm0 4h-6v2h6v-2z"/>
          </svg>
        </button>
        
        <button
          className={styles.zoomButton}
          onClick={onZoomIn}
          disabled={zoomLevel >= maxZoom}
          title="Zoom In"
          aria-label="Zoom In"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>
      </div>
      
      <div className={styles.zoomSlider}>
        <input
          type="range"
          min={minZoom}
          max={maxZoom}
          step={0.1}
          value={zoomLevel}
          onChange={(e) => {
            const newZoom = parseFloat(e.target.value);
            onZoomChange?.(newZoom);
          }}
          className={styles.slider}
          title={`Zoom: ${zoomPercentage}%`}
        />
      </div>
    </div>
  );
};
