import { useEditorProperties } from "../../context/EditorContext";
import styles from "./PropertiesPanel.module.css";

const parseNumber = (value: string, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const PropertiesPanel = () => {
  const editor = useEditorProperties();
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
    setProjectName,
    projectName,
    isDirty,
    loopPlayback,
    setLoopPlayback,
  } = editor;
  const video = selectedItem?.type === "video"
    ? clips.find((clip) => clip.id === selectedItem.id)
    : undefined;
  const audio = selectedItem?.type === "audio"
    ? audioClips.find((clip) => clip.id === selectedItem.id)
    : undefined;

  return (
    <aside className={styles.panel}>
      <section>
        <h3>Project</h3>
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          aria-label="Project name"
        />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={loopPlayback}
            onChange={(event) => setLoopPlayback(event.target.checked)}
          />
          Loop playback
        </label>
        <button onClick={() => void saveProject()}>
          {isDirty ? "Save project *" : "Project saved"}
        </button>
      </section>

      <section>
        <h3>Media library</h3>
        <div className={styles.mediaList}>
          {clips.map((clip) => (
            <button
              key={clip.id}
              onClick={() => editor.selectItem({ type: "video", id: clip.id })}
            >
              🎬 {clip.name}
            </button>
          ))}
          {audioClips.filter((clip) => !clip.sourceVideoClipId).map((clip) => (
            <button
              key={clip.id}
              onClick={() => editor.selectItem({ type: "audio", id: clip.id })}
            >
              ♫ {clip.name}
            </button>
          ))}
          {!clips.length && !audioClips.length && <p>Drop files into the editor.</p>}
        </div>
      </section>

      {video && (
        <section>
          <h3>Video clip</h3>
          <label>
            Name
            <input
              value={video.name}
              onChange={(event) => updateVideoClip(video.id, { name: event.target.value })}
            />
          </label>
          <label>
            Layer
            <input
              type="number"
              value={video.zIndex}
              onChange={(event) => updateVideoClip(video.id, {
                zIndex: parseNumber(event.target.value, video.zIndex),
              })}
            />
          </label>
          <div className={styles.grid}>
            <label>
              X
              <input
                type="number"
                value={video.transform.x}
                onChange={(event) => updateVideoClip(video.id, { transform: {
                  ...video.transform,
                  x: parseNumber(event.target.value, video.transform.x),
                } })}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={video.transform.y}
                onChange={(event) => updateVideoClip(video.id, { transform: {
                  ...video.transform,
                  y: parseNumber(event.target.value, video.transform.y),
                } })}
              />
            </label>
            <label>
              Scale
              <input
                type="number"
                min="0.1"
                max="5"
                step="0.05"
                value={video.transform.scale}
                onChange={(event) => updateVideoClip(video.id, { transform: {
                  ...video.transform,
                  scale: Math.max(0.1, parseNumber(event.target.value, video.transform.scale)),
                } })}
              />
            </label>
            <label>
              Rotation
              <input
                type="number"
                step="1"
                value={video.transform.rotation}
                onChange={(event) => updateVideoClip(video.id, { transform: {
                  ...video.transform,
                  rotation: parseNumber(event.target.value, video.transform.rotation),
                } })}
              />
            </label>
          </div>
          <label>
            Fit
            <select
              value={video.transform.fit}
              onChange={(event) => updateVideoClip(video.id, { transform: {
                ...video.transform,
                fit: event.target.value === "cover" ? "cover" : "contain",
              } })}
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
            </select>
          </label>
          <div className={styles.actions}>
            <button onClick={() => bringToFront({ type: "video", id: video.id })}>
              Bring to front
            </button>
            <button onClick={duplicateSelected}>Duplicate</button>
            <button className={styles.danger} onClick={deleteSelected}>Delete</button>
          </div>
        </section>
      )}

      {audio && (
        <section>
          <h3>Audio clip</h3>
          <label>
            Name
            <input
              value={audio.name}
              onChange={(event) => updateAudioClip(audio.id, { name: event.target.value })}
            />
          </label>
          <label>
            Priority
            <input
              type="number"
              value={audio.zIndex}
              onChange={(event) => updateAudioClip(audio.id, {
                zIndex: parseNumber(event.target.value, audio.zIndex),
              })}
            />
          </label>
          <label>
            Volume {Math.round(audio.volume * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={audio.volume}
              onChange={(event) => updateAudioClip(audio.id, {
                volume: parseNumber(event.target.value, audio.volume),
              })}
            />
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={audio.muted}
              onChange={(event) => updateAudioClip(audio.id, { muted: event.target.checked })}
            />
            Muted
          </label>
          <label>
            Fade in (ms)
            <input
              type="number"
              min="0"
              max={audio.clipDuration}
              value={audio.fadeIn}
              onChange={(event) => updateAudioClip(audio.id, {
                fadeIn: Math.min(
                  audio.clipDuration,
                  Math.max(0, parseNumber(event.target.value, audio.fadeIn)),
                ),
              })}
            />
          </label>
          <label>
            Fade out (ms)
            <input
              type="number"
              min="0"
              max={audio.clipDuration}
              value={audio.fadeOut}
              onChange={(event) => updateAudioClip(audio.id, {
                fadeOut: Math.min(
                  audio.clipDuration,
                  Math.max(0, parseNumber(event.target.value, audio.fadeOut)),
                ),
              })}
            />
          </label>
          {audio.sourceVideoClipId && (
            <button onClick={() => updateAudioClip(audio.id, { sourceVideoClipId: undefined })}>
              Unlink from video
            </button>
          )}
          <div className={styles.actions}>
            <button onClick={() => bringToFront({ type: "audio", id: audio.id })}>
              Bring to front
            </button>
            <button onClick={duplicateSelected}>Duplicate</button>
            <button className={styles.danger} onClick={deleteSelected}>Delete</button>
          </div>
        </section>
      )}

      <section className={styles.shortcuts}>
        <h3>Shortcuts</h3>
        <p>Space Play · S Split · Delete Remove</p>
        <p>Ctrl+Z Undo · Ctrl+D Duplicate · Ctrl+S Save</p>
      </section>
    </aside>
  );
};
