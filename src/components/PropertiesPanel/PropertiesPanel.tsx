import React from "react";
import { useEditor, useEditorInternals } from "../../context/EditorContext";
import styles from "./PropertiesPanel.module.css";

export const PropertiesPanel: React.FC = () => {
  const editor = useEditor();
  const { _updateState } = useEditorInternals();
  const {
    clips,
    audioClips,
    selectedItem,
    updateVideoClip,
    updateAudioClip,
    bringToFront,
    duplicateSelected,
    deleteSelected,
    saveProject,
    projectName,
    isDirty,
    loopPlayback,
    setLoopPlayback,
  } = editor;
  const video = selectedItem?.type === "video" ? clips.find((clip) => clip.id === selectedItem.id) : null;
  const audio = selectedItem?.type === "audio" ? audioClips.find((clip) => clip.id === selectedItem.id) : null;

  return (
    <aside className={styles.panel}>
      <section>
        <h3>Project</h3>
        <input value={projectName} onChange={(event) => _updateState({ projectName: event.target.value, isDirty: true })} aria-label="Project name" />
        <label className={styles.checkbox}><input type="checkbox" checked={loopPlayback} onChange={(event) => setLoopPlayback(event.target.checked)} /> Loop playback</label>
        <button onClick={() => void saveProject()}>{isDirty ? "Save project *" : "Project saved"}</button>
      </section>

      <section>
        <h3>Media library</h3>
        <div className={styles.mediaList}>
          {clips.map((clip) => <button key={clip.id} onClick={() => editor.selectItem({ type: "video", id: clip.id })}>🎬 {clip.name}</button>)}
          {audioClips.filter((clip) => !clip.sourceVideoClipId).map((clip) => <button key={clip.id} onClick={() => editor.selectItem({ type: "audio", id: clip.id })}>♫ {clip.name}</button>)}
          {!clips.length && !audioClips.length && <p>Drop files into the editor.</p>}
        </div>
      </section>

      {(video || audio) && <section>
        <h3>{video ? "Video clip" : "Audio clip"}</h3>
        <label>Name<input value={(video ?? audio)!.name} onChange={(event) => video ? updateVideoClip(video.id, { name: event.target.value }) : updateAudioClip(audio!.id, { name: event.target.value })} /></label>
        <label>Layer / priority<input type="number" value={(video ?? audio)!.zIndex} onChange={(event) => video ? updateVideoClip(video.id, { zIndex: Number(event.target.value) }) : updateAudioClip(audio!.id, { zIndex: Number(event.target.value) })} /></label>

        {video && <>
          <div className={styles.grid}>
            <label>X<input type="number" value={video.transform.x} onChange={(event) => updateVideoClip(video.id, { transform: { ...video.transform, x: Number(event.target.value) } })} /></label>
            <label>Y<input type="number" value={video.transform.y} onChange={(event) => updateVideoClip(video.id, { transform: { ...video.transform, y: Number(event.target.value) } })} /></label>
            <label>Scale<input type="number" min="0.1" max="5" step="0.05" value={video.transform.scale} onChange={(event) => updateVideoClip(video.id, { transform: { ...video.transform, scale: Number(event.target.value) } })} /></label>
            <label>Rotation<input type="number" step="1" value={video.transform.rotation} onChange={(event) => updateVideoClip(video.id, { transform: { ...video.transform, rotation: Number(event.target.value) } })} /></label>
          </div>
          <label>Fit<select value={video.transform.fit} onChange={(event) => updateVideoClip(video.id, { transform: { ...video.transform, fit: event.target.value as "contain" | "cover" } })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
        </>}

        {audio && <>
          <label>Volume {Math.round(audio.volume * 100)}%<input type="range" min="0" max="1" step="0.01" value={audio.volume} onChange={(event) => updateAudioClip(audio.id, { volume: Number(event.target.value) })} /></label>
          <label className={styles.checkbox}><input type="checkbox" checked={audio.muted} onChange={(event) => updateAudioClip(audio.id, { muted: event.target.checked })} /> Muted</label>
          <label>Fade in (ms)<input type="number" min="0" max={audio.clipDuration} value={audio.fadeIn} onChange={(event) => updateAudioClip(audio.id, { fadeIn: Math.max(0, Number(event.target.value)) })} /></label>
          <label>Fade out (ms)<input type="number" min="0" max={audio.clipDuration} value={audio.fadeOut} onChange={(event) => updateAudioClip(audio.id, { fadeOut: Math.max(0, Number(event.target.value)) })} /></label>
          {audio.sourceVideoClipId && <button onClick={() => updateAudioClip(audio.id, { sourceVideoClipId: undefined })}>Unlink from video</button>}
        </>}

        <div className={styles.actions}>
          <button onClick={() => bringToFront(selectedItem!)}>Bring to front</button>
          <button onClick={duplicateSelected}>Duplicate</button>
          <button className={styles.danger} onClick={deleteSelected}>Delete</button>
        </div>
      </section>}

      <section className={styles.shortcuts}>
        <h3>Shortcuts</h3>
        <p>Space Play · S Split · Delete Remove</p>
        <p>Ctrl+Z Undo · Ctrl+D Duplicate · Ctrl+S Save</p>
      </section>
    </aside>
  );
};
