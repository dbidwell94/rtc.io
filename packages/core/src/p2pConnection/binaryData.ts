// This comment describes the header structure of a chunk
// Header Size: 21 bytes
//
// 0  - 15 -- UUID as bytes (this is the binary ID used to track chunks)
// 16 - 19 -- The index of the chunk this header is for
// 20      -- boolean flag representing if this is the final chunk

import { Option, option, result, Result } from "@dbidwell94/ts-utils";

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

export interface BinaryChunkerOptions {
  maxChunkSize?: number;
  dataTimeout?: number;
  onDataTimeout: (dataId: string) => void;
}

const HEADER_BYTE_SIZE = 21;

export class BinaryChunker {
  private _chunks: Map<
    string,
    {
      metadata: Option<unknown>;
      buffers: ArrayBuffer[];
      hasFinal: boolean;
      totalExpectedSize: number;
      cleanupTimeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  private _maxChunkSize: number;
  private _dataTimeoutMs: number;
  private _onDataTimeout: (dataId: string) => void;

  private _streams: Map<
    string,
    {
      controller: ReadableStreamDefaultController<Uint8Array>;
      totalExpectedSize: number;
      buffers: ArrayBuffer[];
      hasFinal: boolean;
      currentChunkIndex: number;
      cleanupTimeout: ReturnType<typeof setTimeout>;
      timeoutHandler: () => void;
    }
  > = new Map();

  constructor({
    maxChunkSize = 1024,
    dataTimeout = 5000,
    onDataTimeout,
  }: BinaryChunkerOptions) {
    if (maxChunkSize <= HEADER_BYTE_SIZE) {
      throw new Error(
        "Unable to create a BinaryChunker with a max packet size less than the header size",
      );
    }
    this._maxChunkSize = maxChunkSize;
    this._dataTimeoutMs = dataTimeout;
    this._onDataTimeout = onDataTimeout;
  }

  /**
   * A read-only property which returns how many bytes a packets' header is.
   * Class' 'maxChunkSize' should never be lower than this or an Error
   * will be thrown
   */
  static get HEADER_SIZE() {
    return HEADER_BYTE_SIZE;
  }

  chunkData<T extends JsonValue = null>(
    dataToChunk: ArrayBuffer,
    metadata?: T,
  ): AsyncGenerator<ArrayBuffer> {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(dataToChunk));
        controller.close();
      },
    });

    return this.streamData(stream, metadata);
  }

  async *streamData<T extends JsonValue = null>(
    dataStream: ReadableStream<Uint8Array>,
    metadata?: T,
  ): AsyncGenerator<ArrayBuffer> {
    const dataId = crypto.randomUUID();
    const dataIdBytes = this.uuidToBytes(dataId);

    yield this.buildMetadata(metadata ?? null, dataIdBytes);

    // start at 1, 0 is the metadata
    let chunkIndex = 1;

    const buffer = new Uint8Array(this._maxChunkSize);
    let bufferCursor = HEADER_BYTE_SIZE;

    const reader = dataStream.getReader();
    try {
      let readDone = false;
      while (!readDone) {
        const { done, value } = await reader.read();
        if (done || !value || value.byteLength < 1) {
          readDone = true;
          break;
        }

        // represents where in the current {value} we are.
        let valueCursor = 0;

        while (valueCursor < value.byteLength) {
          const spaceInBuffer = this._maxChunkSize - bufferCursor;
          const dataLeftInBytes = value.byteLength - valueCursor;
          const bytesToCopy = Math.min(spaceInBuffer, dataLeftInBytes);

          const valueSlice = value.subarray(
            valueCursor,
            valueCursor + bytesToCopy,
          );
          buffer.set(valueSlice, bufferCursor);

          valueCursor += bytesToCopy;
          bufferCursor += bytesToCopy;

          if (bufferCursor === this._maxChunkSize) {
            // Have to create a copy, otherwise will be overwriting the buffer before
            // it has been sent.
            yield this.buildHeader(
              dataIdBytes,
              chunkIndex,
              false,
              buffer.buffer,
            ).slice(0);
            chunkIndex += 1;
            bufferCursor = HEADER_BYTE_SIZE;
          }
        }
      }

      // edge case, we didn't have a full buffer in the while loop and we still have data
      // to send in the buffer
      if (bufferCursor !== HEADER_BYTE_SIZE) {
        // we don't need to take the ArrayBuffer, it has been written into the
        // buffer variable
        this.buildHeader(dataIdBytes, chunkIndex, true, buffer.buffer);
        yield buffer.slice(0, bufferCursor).buffer;
      } else {
        yield this.buildHeader(dataIdBytes, chunkIndex, true);
      }
    } finally {
      reader.releaseLock();
    }
  }

  setDataIsStream(dataId: string): Result<ReadableStream<Uint8Array>> {
    const timeoutHandler = () => {
      const optData = option.unknown(this._streams.get(dataId));
      if (optData.isNone()) return;
      const { cleanupTimeout, controller } = optData.value;

      // final check to ensure the timeout is clear
      clearTimeout(cleanupTimeout);
      // Signal to the caller that a timeout has occurred
      this._onDataTimeout(dataId);
      // Close the controller with an error indicating that
      // a timeout has occurred
      controller.error(
        new Error(
          `Timeout of ${this._dataTimeoutMs} ms was reached when receiving packets`,
        ),
      );
    };

    const mainStream = new ReadableStream({
      cancel: () => {
        const streamObj = option.unknown(this._streams.get(dataId));
        if (streamObj.isNone()) return;

        const { cleanupTimeout } = streamObj.value;

        clearTimeout(cleanupTimeout);
        this._streams.delete(dataId);
      },
      start: (controller) => {
        const chunksObj = option
          .unknown(this._chunks.get(dataId))
          .okOr("Unable to get chunks from internal BinaryChunker state");
        if (chunksObj.isError()) {
          return result.err(chunksObj.error);
        }
        const { buffers, cleanupTimeout, hasFinal, totalExpectedSize } =
          chunksObj.value;

        // remove the metadata from the start of the buffer. The user already has it.
        buffers.shift();

        clearTimeout(cleanupTimeout);

        this._streams.set(dataId, {
          buffers,
          controller,
          hasFinal: hasFinal,
          totalExpectedSize,
          cleanupTimeout: setTimeout(timeoutHandler, this._dataTimeoutMs),
          timeoutHandler,
          // Starting with index 1 because index 0 SHOULD be the metadata,
          // which has been removed from the buffer array
          currentChunkIndex: 1,
        });

        this._chunks.delete(dataId);
      },
    });

    return result.ok(mainStream);
  }

  receiveChunk<T extends JsonValue = null>(
    chunk: ArrayBuffer,
  ): {
    data: Option<ArrayBuffer>;
    metadata: Option<T>;
    id: string;
    isStream: boolean;
  } {
    const header = this.parseHeaderFromBuffer(chunk);

    if (this._streams.has(header.id)) {
      this.handleStream(chunk.slice(HEADER_BYTE_SIZE), header);
      return {
        data: option.none(),
        id: header.id,
        isStream: true,
        metadata: option.none(),
      };
    }

    const createCleanupTimeout = (
      currentTimeout?: ReturnType<typeof window.setTimeout>,
    ) => {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
      return setTimeout(() => {
        this._chunks.delete(header.id);
        this._onDataTimeout(header.id);
      }, this._dataTimeoutMs);
    };

    if (!this._chunks.has(header.id)) {
      this._chunks.set(header.id, {
        metadata: option.none(),
        buffers: [],
        hasFinal: false,
        totalExpectedSize: 0,
        cleanupTimeout: createCleanupTimeout(),
      });
    } else {
      // new data received, set a new data timeout.
      this._chunks.get(header.id)!.cleanupTimeout = createCleanupTimeout(
        this._chunks.get(header.id)!.cleanupTimeout,
      );
    }

    if (header.chunkIndex === 0) {
      const metadata = this.parseMetadata(chunk.slice(HEADER_BYTE_SIZE));
      this._chunks.get(header.id)!.metadata = metadata;
    }

    const { buffers: transfer } = this._chunks.get(header.id)!;

    transfer[header.chunkIndex] = chunk.slice(HEADER_BYTE_SIZE);

    if (header.isFinal) {
      this._chunks.get(header.id)!.hasFinal = true;
      this._chunks.get(header.id)!.totalExpectedSize = header.chunkIndex + 1;
    }

    if (
      this._chunks.get(header.id)!.hasFinal &&
      Object.keys(transfer).length ===
        this._chunks.get(header.id)!.totalExpectedSize
    ) {
      // remove the metadata buffer from the transfer array. No longer needed.
      transfer.shift()!;

      const assembled = this.concatBuffers(...transfer);

      clearTimeout(this._chunks.get(header.id)!.cleanupTimeout);
      const metadata = this._chunks.get(header.id)!.metadata as Option<T>;
      this._chunks.delete(header.id);

      return {
        data: option.some(assembled),
        metadata,
        id: header.id,
        isStream: false,
      };
    }

    return {
      data: option.none(),
      metadata: this._chunks.get(header.id)!.metadata as Option<T>,
      id: header.id,
      isStream: false,
    };
  }

  private handleStream(dataNoHeader: ArrayBuffer, header: ChunkHeader) {
    // We have already checked that this is a valid reference in `receiveChunk`
    const streamObj = this._streams.get(header.id)!;

    // At this point, the metadata has already been removed from this buffer. This buffer
    // is full of nothing but raw data with no headers
    const { buffers, controller } = streamObj;

    if (header.isFinal) {
      streamObj.hasFinal = true;
      streamObj.totalExpectedSize = header.chunkIndex;
    }

    buffers[header.chunkIndex - streamObj.currentChunkIndex] = dataNoHeader;

    // check if the 0 index is ready to go, iterate until we find an undefined value
    while (buffers[0]) {
      const dataToSend = buffers.shift()!;
      controller.enqueue(new Uint8Array(dataToSend));
      streamObj.currentChunkIndex++;
    }

    // As we have just received a new chunk, we should reset the data timeout
    // timer to ensure that we don't timeout on the WHOLE transfer, just when
    // we don't receive a chunk
    clearTimeout(streamObj.cleanupTimeout);

    // Final obj would have been at the last index. So if the buffer is empty
    // and we had the final object, then the data is complete and has all been
    // enqueued
    if (streamObj.hasFinal && buffers.length === 0) {
      controller.close();
      this._streams.delete(header.id);
    } else {
      streamObj.cleanupTimeout = setTimeout(
        streamObj.timeoutHandler,
        this._dataTimeoutMs,
      );
    }
  }

  /**
   * This will either return a new ArrayBuffer, or will modify the incoming
   * header param to put the header at the start of the buffer
   */
  private buildHeader(
    fileId: Uint8Array,
    chunkIndex: number,
    isLast: boolean,
    header: ArrayBuffer = new ArrayBuffer(HEADER_BYTE_SIZE),
  ): ArrayBuffer {
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
