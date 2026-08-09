export const createFinalAudioFilter = (audioLabels: string[], seconds: number) => {
  const duration = seconds.toFixed(6);
  if (!audioLabels.length) {
    return `anullsrc=r=48000:cl=stereo,atrim=start=0:end=${duration},asetpts=N/SR/TB[afinal]`;
  }

  // The FFmpeg 4.3 core bundled with @ffmpeg/core 0.11 does not support
  // amix's newer `normalize` option. Pad every input to the same duration so
  // the older filter's built-in normalization remains constant, then restore
  // the original summed volume after mixing.
  const paddedLabels = audioLabels.map((label, index) => {
    const paddedLabel = `[mix${index}]`;
    return {
      filter: `${label}apad=whole_dur=${duration},atrim=start=0:end=${duration}${paddedLabel}`,
      label: paddedLabel,
    };
  });
  const mix = `${paddedLabels.map(({ label }) => label).join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,volume=${audioLabels.length},atrim=start=0:end=${duration},asetpts=N/SR/TB[afinal]`;
  return [...paddedLabels.map(({ filter }) => filter), mix].join(";");
};
