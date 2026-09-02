import { useEffect, useRef, useState } from "react";
import { useEditorExportData } from "../../context/EditorContext";
import type { ExportPhase } from "../../utils/pixiExportService";
import styles from "./Export.module.css";

type Quality = "low" | "medium" | "high";

const PRESETS: Record<Quality, { width: number; height: number; framerate: number }> = {
  low: { width: 1280, height: 720, framerate: 30 },
  medium: { width: 1920, height: 1080, framerate: 30 },
  high: { width: 1920, height: 1080, framerate: 60 },
};

const isQuality = (value: string): value is Quality => value in PRESETS;

const PHASE_LABELS: Record<ExportPhase, string> = {
  preparing: "Preparing PIXI renderer…",
  rendering: "Rendering and encoding PIXI frames…",
  "loading-engine": "Loading local export engine…",
  transferring: "Preparing encoded media…",
  "mixing-audio": "Rendering timeline audio…",
  muxing: "Muxing audio and video…",
  finalizing: "Finalizing MP4…",
};

export const Export = () => {
  const { clips, audioClips, textClips, effects, totalDuration } = useEditorExportData();
  const [quality, setQuality] = useState<Quality>("medium");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  const startExport = async () => {
    if (!totalDuration || !clips.length || isExporting || abortControllerRef.current) return;
    setDownloadUrl(null);
    setIsExporting(true);
    setProgress(0);
    setStatus("Preparing PIXI renderer…");
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      const { exportTimeline } = await import("../../utils/pixiExportService");
      const url = await exportTimeline({
        clips,
        audioClips,
        textClips,
        effects,
        duration: totalDuration,
        ...PRESETS[quality],
        quality,
        signal: abortController.signal,
        onProgress: (value, phase) => {
          const percentage = Math.round(value * 100);
          setProgress(percentage);
          setStatus(`${PHASE_LABELS[phase]} ${percentage}%`);
        },
      });
      if (!isMountedRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setDownloadUrl(url);
      setProgress(100);
      setStatus("Export complete");
    } catch (error) {
      if (!isMountedRef.current) return;
      setProgress(0);
      setStatus(error instanceof DOMException && error.name === "AbortError"
        ? "Export cancelled"
        : error instanceof Error ? error.message : String(error));
    } finally {
      if (abortControllerRef.current === abortController) abortControllerRef.current = null;
      if (isMountedRef.current) setIsExporting(false);
    }
  };

  return (
    <div className={styles.exportContainer}>
      <h3>Export MP4</h3>
      <p>
        Uses the same PIXI renderer as preview for the visible highest video layer, then
        preserves trims, priority, volume, and fades while muxing audio.
      </p>
      <div className={styles.configPanel}>
        <div className={styles.configGroup}>
          <label htmlFor="export-quality">Quality</label>
          <select
            id="export-quality"
            value={quality}
            onChange={(event) => {
              if (isQuality(event.target.value)) setQuality(event.target.value);
            }}
            disabled={isExporting}
          >
            <option value="low">720p · 30fps</option>
            <option value="medium">1080p · 30fps</option>
            <option value="high">1080p · 60fps</option>
          </select>
        </div>
        <button
          className={styles.exportButton}
          onClick={isExporting
            ? () => {
                setStatus("Cancelling export…");
                abortControllerRef.current?.abort();
              }
            : () => void startExport()}
          disabled={!clips.length}
        >
          {isExporting ? "Cancel export" : "Start audio + video export"}
        </button>
      </div>
      {(isExporting || status) && (
        <div className={styles.progressPanel}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.progressText}>{status}</div>
        </div>
      )}
      {downloadUrl && (
        <div className={styles.downloadPanel}>
          <p>Export complete!</p>
          <a
            href={downloadUrl}
            download={`${Date.now()}-video.mp4`}
            className={styles.downloadButton}
          >
            Download MP4
          </a>
        </div>
      )}
    </div>
  );
};
