export const getMediaDuration = (url: string, kind: "audio" | "video") =>
  new Promise<number>((resolve, reject) => {
    const media = document.createElement(kind);
    const dispose = () => {
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute("src");
      media.load();
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = media.duration * 1000;
      dispose();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error(`The ${kind} has no usable duration.`));
    };
    media.onerror = () => {
      dispose();
      reject(new Error(`The selected ${kind} could not be decoded.`));
    };
    media.src = url;
  });

const seekVideo = (video: HTMLVideoElement, time: number) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Could not seek while creating thumbnails."));
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = time;
  });

export const createVideoThumbnailStrip = async (
  videoSrc: string,
  rangeMs?: { start: number; end: number },
): Promise<HTMLCanvasElement> => {
  const frameCount = 8;
  const frameWidth = 120;
  const frameHeight = 68;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = videoSrc;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not decode video thumbnails."));
    });

    const sourceStart = Math.max(0, (rangeMs?.start ?? 0) / 1000);
    const sourceEnd = Math.min(video.duration, (rangeMs?.end ?? video.duration * 1000) / 1000);
    const canvas = document.createElement("canvas");
    canvas.width = frameWidth * frameCount;
    canvas.height = frameHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for video thumbnails.");
    context.fillStyle = "#090b10";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sourceAspect = (video.videoWidth || 16) / (video.videoHeight || 9);
    for (let index = 0; index < frameCount; index += 1) {
      const progress = (index + 0.5) / frameCount;
      await seekVideo(video, sourceStart + (sourceEnd - sourceStart) * progress);
      let width = frameWidth;
      let height = width / sourceAspect;
      if (height > frameHeight) {
        height = frameHeight;
        width = height * sourceAspect;
      }
      const x = index * frameWidth + (frameWidth - width) / 2;
      const y = (frameHeight - height) / 2;
      context.drawImage(video, x, y, width, height);
    }
    return canvas;
  } finally {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
  }
};

const createFallbackPeaks = (peakCount: number) =>
  Array.from({ length: peakCount }, (_, index) =>
    0.2 + Math.abs(Math.sin(index * 0.41)) * 0.35,
  );

export const createAudioPeaks = async (file: File, peakCount = 180): Promise<number[]> => {
  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const samplesPerPeak = Math.max(1, Math.floor(channel.length / peakCount));
    const peaks = Array.from({ length: peakCount }, (_, peakIndex) => {
      const start = peakIndex * samplesPerPeak;
      const end = Math.min(channel.length, start + samplesPerPeak);
      let max = 0;
      for (let index = start; index < end; index += 1) {
        max = Math.max(max, Math.abs(channel[index]));
      }
      return max;
    });
    const maxPeak = Math.max(...peaks, 0.01);
    return peaks.map((peak) => peak / maxPeak);
  } catch {
    return createFallbackPeaks(peakCount);
  } finally {
    await audioContext?.close().catch(() => undefined);
  }
};
