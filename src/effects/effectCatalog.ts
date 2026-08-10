export const EFFECT_DEFINITIONS = [
  {
    name: "Blur",
    category: "Essentials",
    description: "Softens details and edges.",
  },
  {
    name: "Noise",
    category: "Essentials",
    description: "Adds a consistent film-grain texture.",
  },
  {
    name: "Grayscale",
    category: "Color",
    description: "Removes color for a monochrome look.",
  },
  {
    name: "Sepia",
    category: "Color",
    description: "Applies warm, antique brown tones.",
  },
  {
    name: "Vintage",
    category: "Film looks",
    description: "Creates a faded retro-film palette.",
  },
  {
    name: "Technicolor",
    category: "Film looks",
    description: "Boosts colors with a classic cinema look.",
  },
  {
    name: "Polaroid",
    category: "Film looks",
    description: "Adds the bright tones of instant film.",
  },
  {
    name: "Night",
    category: "Film looks",
    description: "Shifts the image toward deep night tones.",
  },
  {
    name: "Kodachrome",
    category: "Film looks",
    description: "Adds rich contrast and slide-film color.",
  },
] as const;

export type EffectName = (typeof EFFECT_DEFINITIONS)[number]["name"];
export type EffectCategory = (typeof EFFECT_DEFINITIONS)[number]["category"];

export const EFFECT_CATEGORIES: readonly EffectCategory[] = [
  "Essentials",
  "Color",
  "Film looks",
];

const EFFECT_NAME_SET = new Set<string>(
  EFFECT_DEFINITIONS.map((effect) => effect.name),
);

export const isEffectName = (value: unknown): value is EffectName =>
  typeof value === "string" && EFFECT_NAME_SET.has(value);
