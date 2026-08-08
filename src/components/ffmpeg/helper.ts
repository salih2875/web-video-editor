// import { signals } from "@benev/slate";
// import { FFprobeWorker } from "ffprobe-wasm/browser.mjs";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

export class FFmpegHelper {
  ffmpeg = new FFmpeg();
  // ffprobe = new FFprobeWorker();
  // is_loading = signals.op<any>();
  // isLoading: Promise<any>;

  constructor() {
    // async () => {
    // await this.#load_ffmpeg();
    // };
  }

  async load_ffmpeg() {
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.5/dist/esm";
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });
    return this.ffmpeg;
  }
}
