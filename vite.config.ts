import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@ffmpeg/ffmpeg"],
  },
  server: {
    headers: {
      // FFmpeg's WebAssembly worker requires cross-origin isolation.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  worker: {
    format: "es",
  },
  ssr: {
    noExternal: ["@ffmpeg/ffmpeg"],
  },
});
