import { useEditorProperties } from "../../context/editorContexts";
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
    textClips,
    selectedItem,
    updateVideoClip,
    updateAudioClip,
    updateTextClip,
    addTextClip,
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
  const text = selectedItem?.type === "text"
    ? textClips.find((clip) => clip.id === selectedItem.id)
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
        <button className={styles.addText} onClick={addTextClip}>＋ Add text</button>
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
          {textClips.map((clip) => (
            <button
              key={clip.id}
              onClick={() => editor.selectItem({ type: "text", id: clip.id })}
            >
              T {clip.name}
            </button>
          ))}
          {!clips.length && !audioClips.length && !textClips.length
            && <p>Drop files into the editor or add text.</p>}
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

      {text && (
        <section>
          <h3>Text overlay</h3>
          <label>
            Text
            <textarea
              rows={3}
              value={text.text}
              onChange={(event) => {
                const value = event.target.value;
                const firstLine = value.split("\n", 1)[0] ?? "";
                updateTextClip(text.id, {
                  text: value,
                  name: firstLine.slice(0, 30) || "Text",
                });
              }}
            />
          </label>
          <div className={styles.grid}>
            <label>
              X
              <input type="number" min="0" max="1280" value={text.x} onChange={(event) => updateTextClip(text.id, {
                x: Math.max(0, Math.min(1280, parseNumber(event.target.value, text.x))),
              })} />
            </label>
            <label>
              Y
              <input type="number" min="0" max="720" value={text.y} onChange={(event) => updateTextClip(text.id, {
                y: Math.max(0, Math.min(720, parseNumber(event.target.value, text.y))),
              })} />
            </label>
            <label>
              Size
              <input type="number" min="8" max="300" value={text.fontSize} onChange={(event) => updateTextClip(text.id, {
                fontSize: Math.max(8, Math.min(300, parseNumber(event.target.value, text.fontSize))),
              })} />
            </label>
            <label>
              Rotation
              <input type="number" value={text.rotation} onChange={(event) => updateTextClip(text.id, {
                rotation: parseNumber(event.target.value, text.rotation),
              })} />
            </label>
          </div>
          <label>
            Font
            <select value={text.fontFamily} onChange={(event) => updateTextClip(text.id, { fontFamily: event.target.value })}>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="Tahoma">Tahoma</option>
              <option value="Trebuchet MS">Trebuchet</option>
              <option value="Courier New">Courier New</option>
              <option value="Impact">Impact</option>
            </select>
          </label>
          <div className={styles.grid}>
            <label>
              Color
              <input type="color" value={text.color} onChange={(event) => updateTextClip(text.id, { color: event.target.value })} />
            </label>
            <label>
              Alignment
              <select value={text.align} onChange={(event) => updateTextClip(text.id, {
                align: event.target.value as "left" | "center" | "right",
              })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <label>
            Opacity {Math.round(text.opacity * 100)}%
            <input type="range" min="0" max="1" step="0.01" value={text.opacity} onChange={(event) => updateTextClip(text.id, {
              opacity: Math.max(0, Math.min(1, parseNumber(event.target.value, text.opacity))),
            })} />
          </label>
          <div className={styles.toggleRow}>
            <button
              className={text.fontWeight === "bold" ? styles.active : ""}
              onClick={() => updateTextClip(text.id, { fontWeight: text.fontWeight === "bold" ? "normal" : "bold" })}
            >Bold</button>
            <button
              className={text.fontStyle === "italic" ? styles.active : ""}
              onClick={() => updateTextClip(text.id, { fontStyle: text.fontStyle === "italic" ? "normal" : "italic" })}
            >Italic</button>
          </div>
          <div className={styles.actions}>
            <button onClick={() => bringToFront({ type: "text", id: text.id })}>Bring to front</button>
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
