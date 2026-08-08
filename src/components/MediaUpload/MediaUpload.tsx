import React, { useCallback } from "react";
import { useEditor, useEditorInternals } from "../../context/EditorContext";
import styles from "./MediaUpload.module.css";

export const MediaUpload: React.FC = () => {
  const { setVideoFile, setAudioFile, mediaError, isGeneratingThumbnails, isLoadingAudio } = useEditor();
  const { _updateState } = useEditorInternals();

  const handleFile = useCallback(
    (kind: "video" | "audio") => async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith(`${kind}/`)) {
        _updateState({ mediaError: `Please select a valid ${kind} file.` });
        return;
      }
      await (kind === "video" ? setVideoFile(file) : setAudioFile(file));
    },
    [_updateState, setAudioFile, setVideoFile],
  );

  return (
    <div className={styles.uploadContainer}>
      <label htmlFor="video-upload" className={styles.uploadLabel}>
        {isGeneratingThumbnails ? "Processing video…" : "Add video"}
      </label>
      <input id="video-upload" type="file" accept="video/*" onChange={handleFile("video")} className={styles.uploadInput} />

      <label htmlFor="audio-upload" className={`${styles.uploadLabel} ${styles.audioLabel}`}>
        {isLoadingAudio ? "Processing audio…" : "Add audio"}
      </label>
      <input id="audio-upload" type="file" accept="audio/*" onChange={handleFile("audio")} className={styles.uploadInput} />

      {mediaError && <span className={styles.error} title={mediaError}>{mediaError}</span>}
    </div>
  );
};
