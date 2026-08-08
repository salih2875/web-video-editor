import React, { useEffect, useState } from "react";
import { useEditor } from "../../context/EditorContext";
import styles from "./Export.module.css";

type Quality = "low" | "medium" | "high";
const presets: Record<Quality, { width: number; height: number; framerate: number }> = {
  low: { width: 1280, height: 720, framerate: 30 },
  medium: { width: 1920, height: 1080, framerate: 30 },
  high: { width: 1920, height: 1080, framerate: 60 },
};

export const Export: React.FC = () => {
  const { clips, audioClips, Effects, totalDuration } = useEditor();
  const [quality, setQuality] = useState<Quality>("medium");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  const startExport = async () => {
    if (!totalDuration || !clips.length) return;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setIsExporting(true);
    setProgress(0);
    setStatus("Loading export engine…");
    try {
      const { exportTimeline } = await import("../../utils/ffmpegService");
      const preset = presets[quality];
      const url = await exportTimeline({
        clips,
        audioClips,
        effects: Effects,
        duration: totalDuration,
        ...preset,
        quality,
        onProgress: (value) => {
          setProgress(value * 100);
          setStatus(`Rendering video and audio… ${Math.round(value * 100)}%`);
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
      <p>Exports the visible highest video layer and highest-priority audio, including trims, volume, fades, effects, and timeline positions.</p>
      <div className={styles.configPanel}>
        <div className={styles.configGroup}>
          <label>Quality</label>
          <select value={quality} onChange={(event) => setQuality(event.target.value as Quality)} disabled={isExporting}>
            <option value="low">720p · 30fps</option>
            <option value="medium">1080p · 30fps</option>
            <option value="high">1080p · 60fps</option>
          </select>
        </div>
        <button className={styles.exportButton} onClick={() => void startExport()} disabled={isExporting || !clips.length}>
          {isExporting ? "Exporting…" : "Start audio + video export"}
        </button>
      </div>
      {(isExporting || status) && <div className={styles.progressPanel}>
        <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
        <div className={styles.progressText}>{status}</div>
      </div>}
      {downloadUrl && <div className={styles.downloadPanel}>
        <p>Export complete!</p>
        <a href={downloadUrl} download={`${Date.now()}-video.mp4`} className={styles.downloadButton}>Download MP4</a>
      </div>}
    </div>
  );
};
