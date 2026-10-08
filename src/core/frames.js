'use strict';

const HEADER_LENGTH = 4;
const MAX_FRAME_LENGTH = 1024 * 1024;

class FrameError extends Error {}

function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_FRAME_LENGTH) throw new FrameError('Message trop volumineux.');
  const header = Buffer.alloc(HEADER_LENGTH);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

class FrameDecoder {
  #buffer = Buffer.alloc(0);

  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const messages = [];
    while (this.#buffer.length >= HEADER_LENGTH) {
      const length = this.#buffer.readUInt32LE(0);
      if (length > MAX_FRAME_LENGTH) throw new FrameError('Message trop volumineux.');
      if (this.#buffer.length < HEADER_LENGTH + length) break;
      const body = this.#buffer.subarray(HEADER_LENGTH, HEADER_LENGTH + length);
      this.#buffer = this.#buffer.subarray(HEADER_LENGTH + length);
      let message;
      try {
        message = JSON.parse(body.toString('utf8'));
      } catch {
        throw new FrameError('Message illisible.');
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw new FrameError('Message invalide.');
      messages.push(message);
    }
    return messages;
  }
}

module.exports = { FrameDecoder, FrameError, encodeFrame, MAX_FRAME_LENGTH };
