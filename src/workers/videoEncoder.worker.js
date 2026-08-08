// src/workers/videoEncoder.worker.js
class VideoEncoderWorker {
  constructor() {
    this.encoder = null;
    this.config = null;
    this.frameCount = 0;
    this.chunks = [];

    self.addEventListener('message', this.handleMessage.bind(this));
  }

  async handleMessage(event) {
    try {
      switch (event.data.type) {
        case 'init':
          await this.initializeEncoder(event.data);
          break;
        case 'frame':
          await this.encodeFrame(event.data);
          break;
        case 'finish':
          await this.finishEncoding();
          break;
        default:
          this.sendError('Unknown message type');
      }
    } catch (error) {
      this.sendError(`Worker error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async initializeEncoder(message) {
    this.config = message.data;

    // if (!('VideoEncoder' in window)) {
    //   throw new Error('VideoEncoder not supported in this browser');
    // }

    this.encoder = new VideoEncoder({
      output: (chunk) => {
        this.chunks.push(new Uint8Array(chunk.byteLength));
        chunk.copyTo(this.chunks[this.chunks.length - 1]);
      },
      error: (error) => {
        this.sendError(`Encoder error: ${error.message}`);
      }
    });

    const config = {
      codec: 'avc1.640034', // H.264 Baseline Profile
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.framerate,
      avc: { format: "annexb" },
    };

    await this.encoder.configure(config);

    self.postMessage({ type: 'ready' });
  }

  async encodeFrame(message) {
    if (!this.encoder || !this.config) {
      throw new Error('Encoder not initialized');
    }

    const { imageData, timestamp, exportCanvas, frame } = message.data;

    // Create VideoFrame from ImageData by first creating an ImageBitmap
    // const imageBitmap = await createImageBitmap(imageData);
    // const videoFrame = new VideoFrame(imageBitmap, {
    //   timestamp: timestamp * 1000, // Convert to microseconds
    //   duration: (1000 / this.config.framerate) * 1000, // Frame duration in microseconds
    // });
    const videoFrame = frame;

    // For debugging: Create a preview of the frame and send it back
    if (this.frameCount % 10 === 0) { // Only send every 10th frame to reduce overhead
      this.sendFramePreview(imageData);
    }

    // Encode the frame
    // this.encoder.encode(videoFrame, { keyFrame: this.frameCount % (this.config.framerate * 2) === 0 });
    this.encoder.encode(videoFrame)
    this.frameCount++;

    // Close the VideoFrame to free memory
    videoFrame.close();
    // Also close the ImageBitmap to free memory
    // imageBitmap.close();

    // Send progress update
    self.postMessage({
      type: 'progress',
      data: { frameCount: this.frameCount }
    });
  }

  // Add this new method for debug rendering
  sendFramePreview(imageData) {
    // Create a transferable copy of the imageData
    const buffer = imageData.data.buffer.slice(0);

    self.postMessage({
      type: 'debug-frame',
      data: {
        buffer: buffer,
        width: imageData.width,
        height: imageData.height
      }
    }, [buffer]); // Transfer the buffer to avoid copying
  }

  async finishEncoding() {
    if (!this.encoder) {
      throw new Error('Encoder not initialized');
    }

    await this.encoder.flush();
    this.encoder.close();

    // Combine all chunks into a single Uint8Array
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of this.chunks) {
      console.log("Chunk", chunk)
      result.set(chunk, offset);
      offset += chunk.length;
    }

    console.log("Result", result)
    // Send the final video data
    self.postMessage({
      type: 'complete',
      data: { videoData: result.buffer }
    });
  }

  sendError(message) {
    self.postMessage({ type: 'error', data: message });
  }
}

// Initialize the worker
new VideoEncoderWorker();
