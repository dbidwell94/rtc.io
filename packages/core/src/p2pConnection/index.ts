import { PeerId } from "@rtcio/signaling";
import { BinaryChunker, JsonObject, JsonValue } from "./binaryData";
import { Option } from "@dbidwell94/ts-utils";

export interface FileMetadata extends JsonObject {
  name: File["name"];
  type: File["type"];
  lastModified: File["lastModified"];
  size: File["size"];
  _internalIsFile: true;
}

export interface InternalEvents {
  connectionClosed: (peerId: PeerId) => MaybePromise<void>;

  data: <T extends JsonValue>(
    metadata: Option<T>,
    binaryData: ArrayBuffer,
  ) => MaybePromise<void>;

  file: (
    metadata: Omit<FileMetadata, "_internalIsFile">,
    binaryData: Blob,
  ) => MaybePromise<void>;

  fileStream: (
    metadata: Omit<FileMetadata, "_internalIsFile">,
    binaryData: ReadableStream<Uint8Array>,
  ) => MaybePromise<void>;

  dataTimedOut: (dataId: string) => MaybePromise<void>;

  error: (error: Error) => MaybePromise<void>;
}

export type VoidMethods<T> = {
  [K in keyof T as K extends keyof InternalEvents
    ? never
    : T[K] extends (...args: unknown[]) => MaybePromise<void>
      ? K
      : never]: T[K];
};

export type EventMap<T> = T & InternalEvents;

type InternalMessageEvent<T extends VoidMethods<T>> = {
  [K in keyof T]: {
    event: K;
    args: T[K] extends (...args: unknown[]) => void ? Parameters<T[K]> : never;
  };
}[keyof T];

export type MaybePromise<T> = T | Promise<T>;

function metadataIsForFile(metadata: unknown): metadata is FileMetadata {
  if (!metadata) return false;
  if (typeof metadata !== "object") return false;
  return "_internalIsFile" in metadata;
}

export class P2PConnection<
  ClientToPeerEvents extends VoidMethods<ClientToPeerEvents>,
> {
  private _events: {
    [K in keyof EventMap<ClientToPeerEvents>]?: Set<
      EventMap<ClientToPeerEvents>[K]
    >;
  } = Object.create(null);

  private _oneShotEvents: {
    [K in keyof EventMap<ClientToPeerEvents>]?: Set<
      EventMap<ClientToPeerEvents>[K]
    >;
  } = Object.create(null);

  private _chunker: BinaryChunker;
  private _connection: RTCPeerConnection;
  private _data: RTCDataChannel;
  private _peerId: PeerId;

  constructor(
    connection: RTCPeerConnection,
    dataChannel: RTCDataChannel,
    peerId: PeerId,
  ) {
    this._connection = connection;
    this._peerId = peerId;
    this._data = dataChannel;
    this._chunker = new BinaryChunker({ onDataTimeout: this.onDataTimedOut });
    this._data.binaryType = "arraybuffer";

    this._data.bufferedAmountLowThreshold = 1024 * 64; // 64 KB

    this._data.onmessage = async ({ data }) => {
      switch (typeof data) {
        case "string": {
          await this.handleStringData(data);
          break;
        }
        case "object": {
          // typeof ArrayBuffer not working here for some reason
          if (data.constructor.name === "ArrayBuffer") {
            await this.handleBinaryData(data as ArrayBuffer);
            break;
          }
          await this.emitError(
            new Error("Unknown object type received from RTCDataChannel"),
          );
          break;
        }
        default: {
          await this.emitError(
            new Error("Unknown data received from RTCDataChannel"),
          );
          break;
        }
      }
    };

    this._connection.onconnectionstatechange = async () => {
      switch (this._connection.connectionState) {
        case "closed": {
          await this.onClosed();
          break;
        }
        default: {
          break;
        }
      }
    };
  }

  private async onDataTimedOut(dataId: string) {
    for (const callback of this._events["dataTimedOut"] ?? []) {
      await callback(dataId);
    }

    for (const callback of this._oneShotEvents["dataTimedOut"] ?? []) {
      await callback(dataId);
      this._oneShotEvents["dataTimedOut"]?.delete(callback);
    }
  }

  private async emitError(error: Error) {
    for (const callback of this._events["error"] ?? []) {
      await callback(error);
    }

    for (const callback of this._oneShotEvents["error"] ?? []) {
      await callback(error);
      this._oneShotEvents["error"]?.delete(callback);
    }
  }

  private async handleBinaryData(data: ArrayBuffer) {
    const {
      data: optData,
      id,
      metadata: optMetadata,
      isStream,
    } = this._chunker.receiveChunk<FileMetadata | JsonValue>(data);

    // This is already handled by a ReadableStream
    if (isStream) {
      return;
    }

    if (
      optMetadata.isSome() &&
      metadataIsForFile(optMetadata.value) &&
      ((this._events["fileStream"]?.size ?? 0 > 0) ||
        (this._oneShotEvents["fileStream"]?.size ?? 0 > 0))
    ) {
      this.handleFileStream(id, optMetadata.value);
    }

    if (optData.isSome()) {
      const data = optData.value;

      if (optMetadata.isSome() && metadataIsForFile(optMetadata.value)) {
        const fileBlob = new Blob([data]);

        for (const callback of this._events["file"] ?? []) {
          await callback(optMetadata.value, fileBlob);
        }

        for (const callback of this._oneShotEvents["file"] ?? []) {
          await callback(optMetadata.value, fileBlob);
          this._oneShotEvents["file"]?.delete(callback);
        }
        return;
      }

      for (const callback of this._events["data"] ?? []) {
        await callback(optMetadata, optData.value);
      }

      for (const callback of this._oneShotEvents["data"] ?? []) {
        await callback(optMetadata, optData.value);
        this._oneShotEvents["data"]?.delete(callback);
      }
    }
  }

  private async handleFileStream(fileId: string, metadata: FileMetadata) {
    const mainStreamResult = this._chunker.setDataIsStream(fileId);

    if (mainStreamResult.isError()) {
      this.emitError(mainStreamResult.error);
      return;
    }

    const mainStream = mainStreamResult.value;

    const listeners: Array<EventMap<ClientToPeerEvents>["fileStream"]> =
      Array.from(this._events["fileStream"] ?? []).concat(
        Array.from(this._oneShotEvents["fileStream"] ?? []),
      );

    if (listeners.length === 1) {
      const [callback] = listeners;
      callback(metadata, mainStream);
      this._oneShotEvents["fileStream"]?.delete(callback);
    } else {
      const streams: Array<ReadableStream<Uint8Array>> = mainStream.tee();
      // tee will basically push the data on a 'conveyer belt' down the line.
      // It creates new ReadableStream objects that are NOT copies. More just
      // pit stops on the way to the final location.
      // const [stream1, stream2] = item.tee();
      // PEER ->->->->-> stream1 ->->->-> stream2
      for (let i = 0; i < listeners.length - 2; i++) {
        streams.push(...streams.pop()!.tee());
      }

      listeners.forEach((callback, index) => {
        callback(metadata, streams[index]);
        this._oneShotEvents["fileStream"]?.delete(callback);
      });
    }
  }

  private async handleStringData(data: string) {
    const messageData: InternalMessageEvent<ClientToPeerEvents> =
      JSON.parse(data);

    for (const callback of this._events[messageData.event] ?? []) {
      await callback(...messageData.args);
    }

    for (const callback of this._oneShotEvents[messageData.event] ?? []) {
      await callback(...messageData.args);
      this._oneShotEvents[messageData.event]?.delete(callback);
    }
  }

  private async onClosed() {
    this._events["connectionClosed"]?.forEach(async (callback) => {
      await callback(this._peerId);
    });
  }

  get id() {
    return this._peerId;
  }

  private async waitForBuffer() {
    if (this._data.bufferedAmount > this._data.bufferedAmountLowThreshold) {
      await new Promise<void>((res) => {
        const onBufferAmountLow = () => {
          this._data.removeEventListener(
            "bufferedamountlow",
            onBufferAmountLow,
          );
          res();
        };

        this._data.addEventListener("bufferedamountlow", onBufferAmountLow);
      });
    }
  }

  async sendRaw<T extends JsonValue>(data: ArrayBuffer, metadata?: T) {
    const chunks = this._chunker.chunkData(data, metadata);

    for (const chunk of chunks) {
      await this.waitForBuffer();

      this._data.send(chunk);
    }
  }

  async sendFile(file: File) {
    const fileMetadata: FileMetadata = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
      _internalIsFile: true,
    };

    await this.sendRaw(await file.arrayBuffer(), fileMetadata);
  }

  async emit<TKey extends keyof ClientToPeerEvents>(
    event: TKey,
    ...args: Parameters<ClientToPeerEvents[TKey]>
  ) {
    // TODO! handle the creation of this message better so that I don't have to
    // cast `as unknown as T` :puke:.
    const message = {
      event,
      args,
    } as unknown as InternalMessageEvent<ClientToPeerEvents>;

    await this.waitForBuffer();

    this._data.send(JSON.stringify(message));
  }

  once<TKey extends keyof InternalEvents>(
    event: TKey,
    callback: InternalEvents[TKey],
  ): void;
  once<TKey extends keyof ClientToPeerEvents>(
    event: TKey,
    callback: ClientToPeerEvents[TKey],
  ): void;
  once<TKey extends keyof EventMap<ClientToPeerEvents>>(
    event: TKey,
    callback: EventMap<ClientToPeerEvents>[TKey],
  ) {
    if (this._oneShotEvents[event]) {
      this._oneShotEvents[event].add(callback);
    } else {
      this._oneShotEvents[event] = new Set([callback]);
    }
  }

  on<TKey extends keyof InternalEvents>(
    event: TKey,
    callback: InternalEvents[TKey],
  ): void;
  on<TKey extends keyof ClientToPeerEvents>(
    event: TKey,
    callback: ClientToPeerEvents[TKey],
  ): void;
  on<TKey extends keyof EventMap<ClientToPeerEvents>>(
    event: TKey,
    handler: EventMap<ClientToPeerEvents>[TKey],
  ) {
    if (this._events[event]) {
      this._events[event].add(handler);
    } else {
      this._events[event] = new Set([handler]);
    }
  }

  off<TKey extends keyof InternalEvents>(
    event: TKey,
    callback: InternalEvents[TKey],
  ): void;
  off<TKey extends keyof ClientToPeerEvents>(
    event: TKey,
    callback: ClientToPeerEvents[TKey],
  ): void;
  off<TKey extends keyof EventMap<ClientToPeerEvents>>(
    event: TKey,
    handler: EventMap<ClientToPeerEvents>[TKey],
  ) {
    if (this._events[event]?.has(handler)) {
      this._events[event].delete(handler);
    }
  }

  async close() {
    const closeData = new Promise<void>((res) => {
      this._data.onclose = () => res();
    });
    const closeConn = new Promise<void>((res) => {
      this._connection.onconnectionstatechange = () => {
        if (this._connection.connectionState === "closed") {
          res();
        }
      };
    });

    this._data.close();
    this._connection.close();
    await Promise.all([closeData, closeConn]);
  }
}
