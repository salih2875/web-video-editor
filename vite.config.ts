import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@ffmpeg/ffmpeg", "@ffmpeg/util"], // Exclude from pre-bundling
  },
  server: {
    headers: {
      // Needed for SharedArrayBuffer
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  worker: {
    format: 'es'
  },
  ssr: {
    noExternal: ["@ffmpeg/ffmpeg"],
  },
});
