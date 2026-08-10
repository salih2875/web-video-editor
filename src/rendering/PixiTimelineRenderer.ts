import { Application, Sprite, Texture, filters, type Filter } from "pixi.js";
import { applyColorMatrixEffect } from "../effects/applyColorMatrixEffect";
import type { Clip, Effect, EffectName } from "../types/editor";
import { getTopTimelineItem } from "../utils/timelineMath";

export const PREVIEW_WIDTH = 1280;
export const PREVIEW_HEIGHT = 720;

interface PixiTimelineRendererOptions {
  width: number;
  height: number;
}

interface VideoResource {
  texture: Texture;
  sprite: Sprite;
  effectSignature: string;
}

export interface TimelineRenderResult {
  activeClip: Clip | null;
  rendered: boolean;
}

const getStableNoiseSeed = (clipId: string) => {
  // NoiseFilter otherwise chooses a different random pattern for preview and export.
  let hash = 2166136261;
  for (let index = 0; index < clipId.length; index += 1) {
    hash ^= clipId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
};

const createFilter = (effectName: EffectName, clipId: string): Filter => {
  if (effectName === "Blur") return new filters.BlurFilter();
  if (effectName === "Noise") {
    return new filters.NoiseFilter(0.5, getStableNoiseSeed(clipId));
  }

  const colorMatrix = new filters.ColorMatrixFilter();
  applyColorMatrixEffect(colorMatrix, effectName);
  return colorMatrix;
};

const destroyFilters = (sprite: Sprite) => {
  sprite.filters?.forEach((filter) => filter.destroy());
  sprite.filters = null;
};

export class PixiTimelineRenderer {
  readonly app: Application;
  readonly canvas: HTMLCanvasElement;
  private readonly videoByClipId = new Map<string, HTMLVideoElement>();
  private readonly resources = new Map<HTMLVideoElement, VideoResource>();
  private visibleSprite: Sprite | null = null;
  private destroyed = false;

  constructor({ width, height }: PixiTimelineRendererOptions) {
    this.app = new Application({
      width,
      height,
      backgroundColor: 0x000000,
      antialias: true,
      autoStart: false,
      preserveDrawingBuffer: true,
    });
    if (!(this.app.view instanceof HTMLCanvasElement)) {
      this.app.destroy(true, { children: true });
      throw new Error("PIXI requires an HTML canvas in this browser.");
    }
    this.canvas = this.app.view;
  }

  registerVideo(clipId: string, video: HTMLVideoElement) {
    this.assertAvailable();
    const previous = this.videoByClipId.get(clipId);
    if (previous === video) return;
    this.videoByClipId.set(clipId, video);
    if (previous) this.releaseVideoIfUnused(previous);
  }

  unregisterVideo(clipId: string) {
    const video = this.videoByClipId.get(clipId);
    if (!video) return;
    this.videoByClipId.delete(clipId);
    this.releaseVideoIfUnused(video);
  }

  renderTimelineFrame(
    timelineTimeMs: number,
    clips: Clip[],
    effects: Effect[],
  ): TimelineRenderResult {
    this.assertAvailable();
    const activeClip = getTopTimelineItem(timelineTimeMs, clips);
    if (!activeClip) {
      this.clear();
      return { activeClip: null, rendered: true };
    }
    return {
      activeClip,
      rendered: this.renderClip(activeClip, effects),
    };
  }

  clear() {
    this.assertAvailable();
    if (this.visibleSprite) {
      this.visibleSprite.parent?.removeChild(this.visibleSprite);
      this.visibleSprite = null;
    }
    this.app.renderer.render(this.app.stage);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resources.forEach(({ sprite, texture }) => {
      sprite.parent?.removeChild(sprite);
      destroyFilters(sprite);
      sprite.destroy({ texture: false, baseTexture: false });
      texture.destroy(true);
    });
    this.resources.clear();
    this.videoByClipId.clear();
    this.visibleSprite = null;
    this.app.destroy(true, { children: true });
  }

  private renderClip(clip: Clip, effects: Effect[]) {
    const video = this.videoByClipId.get(clip.id);
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;

    const resource = this.getResource(video);
    const { sprite, texture } = resource;
    texture.baseTexture.update();

    const fitScale = clip.transform.fit === "cover" ? Math.max : Math.min;
    const scale = fitScale(
      this.app.screen.width / Math.max(1, video.videoWidth),
      this.app.screen.height / Math.max(1, video.videoHeight),
    ) * clip.transform.scale;
    sprite.width = video.videoWidth * scale;
    sprite.height = video.videoHeight * scale;
    sprite.x = this.app.screen.width / 2
      + clip.transform.x * this.app.screen.width / PREVIEW_WIDTH;
    sprite.y = this.app.screen.height / 2
      + clip.transform.y * this.app.screen.height / PREVIEW_HEIGHT;
    sprite.rotation = clip.transform.rotation * Math.PI / 180;

    const effectNames = effects
      .filter((effect) => effect.clipId === clip.id)
      .map((effect) => effect.name);
    const effectSignature = `${clip.id}:${effectNames.join(",")}`;
    if (resource.effectSignature !== effectSignature) {
      destroyFilters(sprite);
      sprite.filters = effectNames.length
        ? effectNames.map((effectName) => createFilter(effectName, clip.id))
        : null;
      resource.effectSignature = effectSignature;
    }

    if (this.visibleSprite !== sprite) {
      this.visibleSprite?.parent?.removeChild(this.visibleSprite);
      this.app.stage.addChild(sprite);
      this.visibleSprite = sprite;
    }
    this.app.renderer.render(this.app.stage);
    return true;
  }

  private getResource(video: HTMLVideoElement) {
    let resource = this.resources.get(video);
    if (resource) return resource;
    const texture = Texture.from(video);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    resource = { texture, sprite, effectSignature: "" };
    this.resources.set(video, resource);
    return resource;
  }

  private releaseVideoIfUnused(video: HTMLVideoElement) {
    if ([...this.videoByClipId.values()].includes(video)) return;
    const resource = this.resources.get(video);
    if (!resource) return;
    if (this.visibleSprite === resource.sprite) {
      resource.sprite.parent?.removeChild(resource.sprite);
      this.visibleSprite = null;
    }
    destroyFilters(resource.sprite);
    resource.sprite.destroy({ texture: false, baseTexture: false });
    resource.texture.destroy(true);
    this.resources.delete(video);
  }

  private assertAvailable() {
    if (this.destroyed) throw new Error("The PIXI timeline renderer has been destroyed.");
  }
}
