// This comment describes the header structure of a chunk
// Header Size: 21 bytes
//
// 0  - 15 -- UUID as bytes (this is the binary ID used to track chunks)
// 16 - 19 -- The index of the chunk this header is for
// 20      -- boolean flag representing if this is the final chunk

import { Option, option } from "@dbidwell94/ts-utils";

/**
 * Represents any valid JSON-serializable primitive value.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Represents a JSON-serializable object.
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Represents a JSON-serializable array.
 */
export type JsonArray = JsonValue[];

/**
 * Represents any value that can be successfully serialized into a JSON string.
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

interface ChunkHeader {
  id: string;
  chunkIndex: number;
  isFinal: boolean;
}

const HEADER_BYTE_SIZE = 21;

export class BinaryChunker {
  private _chunks: Map<string, ArrayBuffer[]> = new Map();
  private _maxChunkSize: number;

  constructor(maxChunkSize = 1024) {
    if (maxChunkSize <= HEADER_BYTE_SIZE) {
      throw new Error(
        "Unable to create a BinaryChunker with a max packet size less than the header size",
      );
    }
    this._maxChunkSize = maxChunkSize;
  }

  static get HEADER_SIZE() {
    return HEADER_BYTE_SIZE;
  }

  chunkData<T extends JsonValue = null>(
    dataToChunk: ArrayBuffer,
    metadata?: T,
  ): ArrayBuffer[] {
    const chunks: ArrayBuffer[] = [];
    const dataId = crypto.randomUUID();

    const dataIdBytes = this.uuidToBytes(dataId);

    const payloadSize = this._maxChunkSize - HEADER_BYTE_SIZE;

    // adding 1 here because of the metadata chunk
    const totalChunks = Math.ceil(dataToChunk.byteLength / payloadSize);

    chunks.push(this.buildMetadata(metadata ?? null, dataIdBytes));

    for (let i = 0; i < dataToChunk.byteLength; i += payloadSize) {
      const currentChunkId = chunks.length;
      const isLastChunk = currentChunkId === totalChunks;

      const header = this.buildHeader(dataIdBytes, currentChunkId, isLastChunk);

      const start = i;
      const end = Math.min(i + payloadSize, dataToChunk.byteLength);
      const chunkPayload = dataToChunk.slice(start, end);

      chunks.push(this.concatBuffers(header, chunkPayload));
    }

    return chunks;
  }

  receiveChunk<T extends JsonValue = null>(
    chunk: ArrayBuffer,
  ): Option<{ data: ArrayBuffer; metadata: Option<T> }> {
    const header = this.parseHeaderFromBuffer(chunk);

    if (!this._chunks.has(header.id)) {
      this._chunks.set(header.id, []);
    }

    const transfer = this._chunks.get(header.id)!;

    transfer[header.chunkIndex] = chunk.slice(HEADER_BYTE_SIZE);

    if (header.isFinal) {
      const metadataBuffer = transfer.shift()!;
      const metadata = this.parseMetadata<T>(metadataBuffer);

      const assembled = this.concatBuffers(...transfer);
      this._chunks.delete(header.id);
      return option.some({ data: assembled, metadata });
    }

    return option.none();
  }

  private buildHeader(
    fileId: Uint8Array,
    chunkIndex: number,
    isLast: boolean,
  ): ArrayBuffer {
    const header = new ArrayBuffer(HEADER_BYTE_SIZE);
    const headerView = new DataView(header);

    // Set the File ID (bytes 0-15)
    new Uint8Array(header).set(fileId, 0);
    // Set the Chunk Index (16 - 19) as a 32-bit unsigned int
    headerView.setUint32(16, chunkIndex, false);
    // Set Last Chunk flag (byte 20)
    headerView.setUint8(20, isLast ? 1 : 0);

    return header;
  }

  private parseHeaderFromBuffer(chunk: ArrayBuffer): ChunkHeader {
    const fileId = this.bytesToId(new Uint8Array(chunk, 0, 16));
    const viewer = new DataView(chunk);

    const chunkIndex = viewer.getUint32(16, false);
    const isLastByte = viewer.getUint8(20);

    return {
      chunkIndex,
      id: fileId,
      isFinal: isLastByte !== 0,
    };
  }

  private bytesToId(incoming: Uint8Array): string {
    return Array.from(incoming, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  private uuidToBytes(rawId: ReturnType<typeof crypto.randomUUID>): Uint8Array {
    const id = rawId.replaceAll("-", "");
    const bytes = new Uint8Array(16);

    let j = 0;
    for (let i = 0; i < id.length; i += 2) {
      bytes[j++] = parseInt(id.substring(i, i + 2), 16);
    }

    return bytes;
  }

  private concatBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((acc, curr) => acc + curr.byteLength, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  }

  private buildMetadata<T extends JsonValue>(
    metadata: T,
    fileId: Uint8Array,
  ): ArrayBuffer {
    const encoder = new TextEncoder();
    const metadataBytes = encoder.encode(JSON.stringify(metadata)).buffer;

    const header = this.buildHeader(fileId, 0, false);
    return this.concatBuffers(header, metadataBytes);
  }

  private parseMetadata<T extends JsonValue = null>(
    fromBuffer: ArrayBuffer,
  ): Option<T> {
    const decoder = new TextDecoder("utf8");
    const decoded = decoder.decode(fromBuffer);
    try {
      return option.unknown(JSON.parse(decoded));
    } catch (_) {
      return option.none();
    }
  }
}
