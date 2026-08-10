import type { EffectName } from "./effectCatalog";

export type ColorMatrixEffectName = Exclude<EffectName, "Blur" | "Noise">;

interface ColorMatrixEffectTarget {
  greyscale: (scale: number, multiply: boolean) => void;
  sepia: (multiply: boolean) => void;
  vintage: (multiply: boolean) => void;
  technicolor: (multiply: boolean) => void;
  polaroid: (multiply: boolean) => void;
  night: (intensity: number, multiply: boolean) => void;
  kodachrome: (multiply: boolean) => void;
}

export const applyColorMatrixEffect = (
  colorMatrix: ColorMatrixEffectTarget,
  effectName: ColorMatrixEffectName,
) => {
  switch (effectName) {
    case "Grayscale":
      colorMatrix.greyscale(1, false);
      break;
    case "Sepia":
      colorMatrix.sepia(false);
      break;
    case "Vintage":
      // These presets use 0-255 offsets. PIXI normalizes them only on its
      // multiply path; the new filter's identity matrix keeps the result unchanged.
      colorMatrix.vintage(true);
      break;
    case "Technicolor":
      colorMatrix.technicolor(true);
      break;
    case "Polaroid":
      colorMatrix.polaroid(false);
      break;
    case "Night":
      colorMatrix.night(0.35, false);
      break;
    case "Kodachrome":
      colorMatrix.kodachrome(true);
      break;
  }
};
