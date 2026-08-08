import React from "react";
import { useEditor } from "../../context/EditorContext";
import styles from "./ControlPanel.module.css";

export const ControlPanel: React.FC = () => {
  const {
    clips,
    audioClips,
    selectedItem,
    currentTime,
    splitClip,
    splitAudioClip,
    duplicateSelected,
    deleteSelected,
    isGeneratingThumbnails,
  } = useEditor();
  const selectedVideo = selectedItem?.type === "video" ? clips.find((clip) => clip.id === selectedItem.id) : null;
  const selectedAudio = selectedItem?.type === "audio" ? audioClips.find((clip) => clip.id === selectedItem.id) : null;
  const activeVideo = selectedVideo ?? clips.find((clip) => currentTime > clip.timelineStart + 50 && currentTime < clip.timelineEnd - 50);
  const activeAudio = selectedAudio ?? audioClips.find((clip) => currentTime > clip.timelineStart + 50 && currentTime < clip.timelineEnd - 50);
  const canSplit = selectedItem?.type === "audio" ? Boolean(activeAudio) : Boolean(activeVideo);

  return (
    <div className={styles.controlPanel}>
      <div className={styles.editControls}>
        <button onClick={() => selectedItem?.type === "audio" ? splitAudioClip() : void splitClip()} disabled={!canSplit || isGeneratingThumbnails} title="Split selected clip at playhead (S)">Split</button>
        <button onClick={duplicateSelected} disabled={!selectedItem} title="Duplicate selected clip (Ctrl+D)">Duplicate</button>
        <button onClick={deleteSelected} disabled={!selectedItem} title="Delete selected clip (Delete)">Delete</button>
      </div>
    </div>
  );
};
