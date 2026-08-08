import { useEffect, useState } from "react";
import { useEditor } from "../../context/EditorContext";
import styles from "./Export.module.css";

type Quality = "low" | "medium" | "high";

const PRESETS: Record<Quality, { width: number; height: number; framerate: number }> = {
  low: { width: 1280, height: 720, framerate: 30 },
  medium: { width: 1920, height: 1080, framerate: 30 },
  high: { width: 1920, height: 1080, framerate: 60 },
};

const isQuality = (value: string): value is Quality => value in PRESETS;

export const Export = () => {
  const { clips, audioClips, effects, totalDuration } = useEditor();
  const [quality, setQuality] = useState<Quality>("medium");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  const startExport = async () => {
    if (!totalDuration || !clips.length || isExporting) return;
    setDownloadUrl(null);
    setIsExporting(true);
    setProgress(0);
    setStatus("Loading export engine…");
    try {
      const { exportTimeline } = await import("../../utils/ffmpegService");
      const url = await exportTimeline({
        clips,
        audioClips,
        effects,
        duration: totalDuration,
        ...PRESETS[quality],
        quality,
        onProgress: (value) => {
          const percentage = Math.round(value * 100);
          setProgress(percentage);
          setStatus(`Rendering video and audio… ${percentage}%`);
        },
      });
      setDownloadUrl(url);
      setStatus("Export complete");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={styles.exportContainer}>
      <h3>Export MP4</h3>
      <p>
        Exports the visible highest video layer and highest-priority audio, including trims,
        volume, fades, effects, and timeline positions.
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
          onClick={() => void startExport()}
          disabled={isExporting || !clips.length}
        >
          {isExporting ? "Exporting…" : "Start audio + video export"}
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
