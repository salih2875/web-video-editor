# Online Video Editor

A browser-based timeline editor built with React, TypeScript, PixiJS, and FFmpeg WebAssembly.

## Features

- Import video and audio by file picker or drag and drop
- Move, trim, split, duplicate, layer, and delete timeline clips
- Adjust video transforms and audio volume, fades, and priority
- Preview blur and noise effects with PixiJS
- Autosave projects in IndexedDB
- Export PIXI-rendered frames to MP4 with WebCodecs and FFmpeg.wasm audio muxing

## Development

Use Node.js 20 or newer.

```bash
npm install
npm run dev
```

Vite serves the cross-origin isolation headers required by FFmpeg WebAssembly. Use the development or preview server instead of opening `index.html` directly. Export also requires browser support for WebCodecs H.264 encoding.

## Validation

```bash
npm test
npm run lint
npm run build
```
