import { useEditor } from "../../context/EditorContext";
import { EFFECT_CATEGORIES, EFFECT_DEFINITIONS } from "../../effects/effectCatalog";
import { getTopTimelineItem } from "../../utils/timelineMath";
import styles from "./EffectsPanel.module.css";

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
      {EFFECT_CATEGORIES.map((category) => (
        <section key={category} className={styles.effectGroup}>
          <h3>{category}</h3>
          {EFFECT_DEFINITIONS.filter((effect) => effect.category === category)
            .map((effectDefinition) => {
              const isActive = effects.some(
                (effect) => effect.clipId === targetClip?.id
                  && effect.name === effectDefinition.name,
              );
              return (
                <button
                  key={effectDefinition.name}
                  type="button"
                  className={styles.effectItem}
                  disabled={!targetClip}
                  aria-pressed={isActive}
                  onClick={() => targetClip
                    && toggleEffect(targetClip.id, effectDefinition.name)}
                >
                  <span className={styles.effectName}>{effectDefinition.name}</span>
                  <span className={styles.effectDescription}>
                    {effectDefinition.description}
                  </span>
                </button>
              );
            })}
        </section>
      ))}
    </div>
  );
};
