import { PeerId } from "@rtcio/signaling";
import {
  BinaryChunker,
  BinaryChunkerOptions,
  JsonObject,
  JsonValue,
} from "./binaryData";
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

export interface P2POptions
  extends Pick<BinaryChunkerOptions, "maxChunkSize" | "dataTimeout"> {
  peerId: PeerId;
  connection: RTCPeerConnection;
  genericDataChannel: RTCDataChannel;
  binaryDataChannel: RTCDataChannel;
}

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
  private _binaryData: RTCDataChannel;
  private _peerId: PeerId;

  constructor({
    connection,
    genericDataChannel,
    binaryDataChannel,
    peerId,
    dataTimeout = 5_000, // 5 seconds
    maxChunkSize = 1024, // 1KB
  }: P2POptions) {
    this._connection = connection;
    this._peerId = peerId;
    this._data = genericDataChannel;
    this._binaryData = binaryDataChannel;
    this._chunker = new BinaryChunker({
      onDataTimeout: this.onDataTimedOut,
      dataTimeout,
      maxChunkSize,
    });
    this._data.binaryType = "arraybuffer";
    this._binaryData.binaryType = "arraybuffer";

    this._data.bufferedAmountLowThreshold = 1024 * 64; // 64 KB
    this._binaryData.bufferedAmountLowThreshold = 1024 * 64; // 64 KB

    this._binaryData.onmessage = async ({ data }) => {
      if (typeof data === "object" && data.constructor.name === "ArrayBuffer") {
        await this.handleBinaryData(data as ArrayBuffer);
        return;
      }
      await this.emitError(
        new Error("Unknown data received from binary RTCDataChannel"),
      );
    };

    this._data.onmessage = async ({ data }) => {
      if (typeof data !== "string") {
        await this.emitError(
          new Error("Unknown data received from generic RTCDataChannel"),
        );
        return;
      }

      await this.handleStringData(data);
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
    this.callHandlers("dataTimedOut", dataId);
  }

  private async emitError(error: Error) {
    this.callHandlers("error", error);
  }

  private async callHandlers<TKey extends keyof InternalEvents>(
    key: TKey,
    ...args: Parameters<InternalEvents[TKey]>
  ): Promise<void>;
  private async callHandlers<TKey extends keyof ClientToPeerEvents>(
    key: TKey,
    ...args: Parameters<ClientToPeerEvents[TKey]>
  ): Promise<void>;
  private async callHandlers<TKey extends keyof EventMap<ClientToPeerEvents>>(
    key: TKey,
    ...args: Parameters<EventMap<ClientToPeerEvents>[TKey]>
  ) {
    for (const callback of this._events[key] ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await callback(...(args as any[]));
    }

    for (const callback of this._oneShotEvents[key] ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await callback(...(args as any[]));
      this._oneShotEvents[key]?.delete(callback);
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
        this.callHandlers("file", optMetadata.value, fileBlob);
        return;
      }

      this.callHandlers("data", optMetadata, optData.value);
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

    await this.callHandlers(messageData.event, ...messageData.args);
  }

  private async onClosed() {
    await this.callHandlers("connectionClosed", this._peerId);
  }

  get id() {
    return this._peerId;
  }

  private async waitForBinaryBuffer() {
    if (
      this._binaryData.bufferedAmount >
      this._binaryData.bufferedAmountLowThreshold
    ) {
      await new Promise<void>((res) => {
        const onBufferAmountLow = () => {
          this._binaryData.removeEventListener(
            "bufferedamountlow",
            onBufferAmountLow,
          );
          res();
        };

        this._binaryData.addEventListener(
          "bufferedamountlow",
          onBufferAmountLow,
        );
      });
    }
  }

  private async waitForGenericBuffer() {
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
      await this.waitForBinaryBuffer();

      this._binaryData.send(chunk);
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

    await this.waitForGenericBuffer();

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
