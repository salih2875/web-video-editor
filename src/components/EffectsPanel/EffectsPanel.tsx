import { useEditor } from "../../context/EditorContext";
import type { EffectName } from "../../types/editor";
import { getTopTimelineItem } from "../../utils/timelineMath";
import styles from "./EffectsPanel.module.css";

const AVAILABLE_EFFECTS: EffectName[] = ["Blur", "Noise"];

export const EffectsPanel = () => {
  const { clips, selectedItem, currentTime, effects, toggleEffect } = useEditor();
  const selectedClip = selectedItem?.type === "video"
    ? clips.find((clip) => clip.id === selectedItem.id) ?? null
    : null;
  const targetClip = selectedClip ?? getTopTimelineItem(currentTime, clips);

  return (
    <div className={styles.effectsPanel}>
      <h2>Effects</h2>
      {!targetClip && <p>Select a video clip to apply an effect.</p>}
      {AVAILABLE_EFFECTS.map((effectName) => {
        const isActive = effects.some(
          (effect) => effect.clipId === targetClip?.id && effect.name === effectName,
        );
        return (
          <button
            key={effectName}
            type="button"
            className={styles.effectItem}
            disabled={!targetClip}
            aria-pressed={isActive}
            onClick={() => targetClip && toggleEffect(targetClip.id, effectName)}
          >
            {effectName}
          </button>
        );
      })}
    </div>
  );
};
