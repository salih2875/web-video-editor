import React from 'react';
import styles from './EffectsPanel.module.css';
import { useEditor} from "../../context/EditorContext";
import { useEditorInternals } from "../../context/EditorContext";
import { filters } from "pixi.js";

interface EffectsPanelProps {
  show: boolean;
}

export const EffectsPanel: React.FC<EffectsPanelProps> = ({ show }) => {
  const {currentClip, Effects} = useEditor();
  const { _updateState } = useEditorInternals();

  const createFilter=(effect:string) => {
    switch (effect) {
      case 'Blur':
        return new filters.BlurFilter();
      case 'Noise':
        return new filters.NoiseFilter();
  }
 }
  // when clicks on some effect in panel it toggles the effect on/off
  const handleEffectClick = (effectName: string) => {
    if (!currentClip) return;

    const hasEffectForClip = (Effects || []).some((e) => e.id === currentClip.id && e.name==effectName);

    if (hasEffectForClip) {
      // const updatedClipEffects = (currentClip.effects||[]).filter((e) =>e!==effectName);
      const updatedEffectsArray = (Effects || []).filter((e) => !(e.id === currentClip.id && e.name === effectName));
      _updateState({ Effects: updatedEffectsArray });
      console.log(`Removed effect for clip ${currentClip.id}`);
    } else {
      const newEffect = {
        id: currentClip.id,
        name: effectName,
        filter: createFilter(effectName),
      };
      const updatedEffectsArray = [ ...(Effects || []), newEffect ];
      _updateState({ Effects: updatedEffectsArray });
      console.log(`Added effect "${effectName}" to clip ${currentClip.id}`);
    }
  };
  if (!show) {
    return null;
  }

  return (
    <div className={styles.effectsPanel}>
      <h2>Effects</h2>
      <div className={styles.effectItem} onClick={() => handleEffectClick('Blur')}>Blur</div>
      <div className={styles.effectItem} onClick={() => handleEffectClick('Noise')}>Noise</div>
      <div className={styles.effectItem} onClick={() => handleEffectClick('Effect 3')}>Effect 3</div>
      
    </div>
  );
};
