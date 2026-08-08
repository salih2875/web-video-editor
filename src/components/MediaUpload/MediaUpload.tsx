import { useCallback } from "react";
import { useEditor } from "../../context/EditorContext";
import styles from "./MediaUpload.module.css";

export const MediaUpload = () => {
  const {
    setVideoFile,
    setAudioFile,
    setMediaError,
    mediaError,
    isGeneratingThumbnails,
    isLoadingAudio,
  } = useEditor();

  const handleFile = useCallback(
    (kind: "video" | "audio") => async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith(`${kind}/`)) {
        setMediaError(`Please select a valid ${kind} file.`);
        return;
      }
      await (kind === "video" ? setVideoFile(file) : setAudioFile(file));
    },
    [setAudioFile, setMediaError, setVideoFile],
  );

  return (
    <div className={styles.uploadContainer}>
      <label htmlFor="video-upload" className={styles.uploadLabel}>
        {isGeneratingThumbnails ? "Processing video…" : "Add video"}
      </label>
      <input
        id="video-upload"
        type="file"
        accept="video/*"
        onChange={handleFile("video")}
        className={styles.uploadInput}
      />

      <label htmlFor="audio-upload" className={`${styles.uploadLabel} ${styles.audioLabel}`}>
        {isLoadingAudio ? "Processing audio…" : "Add audio"}
      </label>
      <input
        id="audio-upload"
        type="file"
        accept="audio/*"
        onChange={handleFile("audio")}
        className={styles.uploadInput}
      />

      {mediaError && <span className={styles.error} title={mediaError}>{mediaError}</span>}
    </div>
  );
};
