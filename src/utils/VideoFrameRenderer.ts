// src/utils/VideoFrameRenderer.ts
import { Application, Filter, Sprite, Texture } from "pixi.js";
import { Clip, Effect } from "../types/editor";

export interface VideoFrameData {
  frameNumber: number;
  timestamp: number;
  imageData: ImageData;
  frame: VideoFrame;
}

export class VideoFrameRenderer {
  private app: Application;
  private videoElement: HTMLVideoElement;
  private videoSprite: Sprite | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(width: number = 1920, height: number = 1080) {
    // Create PIXI application
    this.app = new Application({
      width,
      height,
      backgroundColor: 0x000000,
      preserveDrawingBuffer: true,
    });

    // Create video element
    this.videoElement = document.createElement("video");
    this.videoElement.muted = true;
    this.videoElement.preload = "auto";

    // Create canvas for final frame output
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;
  }

  /**
   * Render a single frame at the given timeline time
   */
  async renderFrame(
    timelineTime: number,
    clips: Clip[],
    effects: Effect[],
  ): Promise<VideoFrameData> {
    // Find active clip
    const activeClip = this.findActiveClip(timelineTime, clips);

    if (activeClip.clip) {
      // Switch video source if needed
      if (this.videoElement.src !== activeClip.clip.clipURL) {
        this.videoElement.src = activeClip.clip.clipURL;
        await this.waitForVideoLoad();
      }

      // Calculate clip time
      const clipTime = activeClip.clip.clipStart + timelineTime - activeClip.clip.timelineStart;

      // Seek video to correct position
      // if (Math.abs(this.videoElement.currentTime - clipTime / 1000) > 0.1) {
      this.videoElement.currentTime = Math.max(0, clipTime / 1000);
      await this.waitForVideoSeek();
      this.videoElement.pause();
      // await this.waitForVideoPause();
      // }

      // Create or update video sprite
      if (!this.videoSprite) {
        const videoTexture = Texture.from(this.videoElement);
        this.videoSprite = new Sprite(videoTexture);
      }

      // Setup video sprite
      this.videoSprite.width = this.app.screen.width;
      this.videoSprite.height = this.app.screen.height;
      this.videoSprite.filters = [];

      // Apply effects for this clip
      const effectsForClip = effects.filter(
        (e) => e.id === activeClip.clip!.id
      );
      effectsForClip.forEach((clipEffect) => {
        if (this.videoSprite && this.videoSprite.filters) {
          this.videoSprite.filters.push(clipEffect.filter as Filter<Record<string, unknown>>);
        }
      });

      // Clear stage and add video sprite
      this.app.stage.removeChildren();
      this.app.stage.addChild(this.videoSprite);

      // Render to canvas
      this.app.renderer.render(this.app.stage);
      this.ctx.drawImage(
        this.app.view,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
    } else {
      // No active clip - render black frame
      this.app.stage.removeChildren();
      this.app.renderer.render(this.app.stage);
      this.ctx.fillStyle = "#000000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Get image data
    const imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    //  const videoFrame = new VideoFrame(imageBitmap, {
    //   timestamp: timestamp * 1000, // Convert to microseconds
    //   duration: (1000 / this.config.framerate) * 1000, // Frame duration in microseconds
    // });
    const frame = new VideoFrame(this.canvas, {
      displayWidth: this.canvas.width,
      displayHeight: this.canvas.height,
      timestamp: timelineTime * 1000,
      duration: 1000 / 60,
    });
    return {
      frameNumber: Math.floor(timelineTime / (1000 / 60)), // Assuming 60fps
      timestamp: timelineTime,
      imageData,
      frame: frame,
    };
  }

  /**
   * Find the active clip at the given timeline time
   */
  private findActiveClip(time: number, clips: Clip[]): { clip: Clip | null } {
    if (!clips || clips.length === 0) return { clip: null };

    const index = clips.findIndex(
      (c) => time >= c.timelineStart && time < c.timelineEnd
    );

    if (index !== -1) {
      return { clip: clips[index] };
    }

    // Handle edge cases
    if (time < clips[0].timelineStart && clips.length > 0) {
      return { clip: clips[0] };
    }
    if (clips.length > 0 && time >= clips[clips.length - 1].timelineEnd) {
      return { clip: clips[clips.length - 1] };
    }

    return { clip: null };
  }

  /**
   * Wait for video to load
   */
  private waitForVideoLoad(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.videoElement.readyState >= 3) {
        resolve();
        return;
      }

      const onLoadedData = () => {
        this.videoElement.removeEventListener("loadeddata", onLoadedData);
        this.videoElement.removeEventListener("error", onError);
        resolve();
      };

      const onError = () => {
        this.videoElement.removeEventListener("loadeddata", onLoadedData);
        this.videoElement.removeEventListener("error", onError);
        reject(new Error("Failed to load video"));
      };

      this.videoElement.addEventListener("loadeddata", onLoadedData);
      this.videoElement.addEventListener("error", onError);

      // Set a timeout to prevent hanging
      setTimeout(() => {
        this.videoElement.removeEventListener("loadeddata", onLoadedData);
        this.videoElement.removeEventListener("error", onError);
        reject(new Error("Video load timeout"));
      }, 10000); // 10 second timeout
    });
  }

  /**
   * Wait for video seek to complete
   */
  private waitForVideoSeek(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        this.videoElement.removeEventListener("seeked", onSeeked);
        this.videoElement.removeEventListener("error", onError);
        resolve();
      };

      const onError = () => {
        this.videoElement.removeEventListener("seeked", onSeeked);
        this.videoElement.removeEventListener("error", onError);
        reject(new Error("Failed to seek video"));
      };

      this.videoElement.addEventListener("seeked", onSeeked);
      this.videoElement.addEventListener("error", onError);

      // Set a timeout to prevent hanging
      setTimeout(() => {
        this.videoElement.removeEventListener("seeked", onSeeked);
        this.videoElement.removeEventListener("error", onError);
        reject(new Error("Video seek timeout"));
      }, 5000); // 5 second timeout
    });
  }


  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.videoSprite) {
      this.videoSprite.destroy();
      this.videoSprite = null;
    }
    this.app.destroy(true, { children: true });
    this.videoElement.pause();
    this.videoElement.removeAttribute("src");
  }
}
