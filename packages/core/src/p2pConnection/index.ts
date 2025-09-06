import { PeerId } from "@rtcio/signaling";
import {
  BinaryChunker,
  BinaryChunkerOptions,
  JsonObject,
  JsonValue,
} from "./binaryData";
import { Option, result, Result } from "@dbidwell94/ts-utils";

/**
 * This event name is called when another peer has signaled to use
 * that they are closing their stream. This will allow us to gracefully
 * handle closing our stream.
 */
const INTERNAL_BYE = "____internal_goodbye";

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
  onClose: () => MaybePromise<void>;
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

  private _onCloseManagerCallback: () => MaybePromise<void>;
  private _calledCloseHandlers: boolean = false;

  constructor({
    connection,
    genericDataChannel,
    binaryDataChannel,
    peerId,
    onClose,
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

    this._onCloseManagerCallback = onClose;

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

    this._connection.onconnectionstatechange = async (evt) => {
      const connection = evt.target as RTCPeerConnection;
      switch (connection.connectionState) {
        case "closed": {
          await this.close();
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
    try {
      const messageData: InternalMessageEvent<ClientToPeerEvents> =
        JSON.parse(data);

      if (messageData.event === INTERNAL_BYE) {
        await this.close();
        return;
      }

      await this.callHandlers(messageData.event, ...messageData.args);
    } catch (err) {
      await this.callHandlers("error", err as Error);
    }
  }

  private async onClosed() {
    if (this._calledCloseHandlers) {
      return;
    }
    await this.callHandlers("connectionClosed", this._peerId);
    await this._onCloseManagerCallback();
    this._calledCloseHandlers = true;
  }

  get id() {
    return this._peerId;
  }

  private async waitForBinaryBuffer(): Promise<Result<void>> {
    if (
      this._binaryData.bufferedAmount >
      this._binaryData.bufferedAmountLowThreshold
    ) {
      const res = await result.fromPromise(
        new Promise<void>((res, rej) => {
          const waitTimeout = setTimeout(() => {
            this._binaryData.removeEventListener(
              "bufferedamountlow",
              onBufferAmountLow,
            );
            rej(
              "Timeout of 500ms exceeded waiting for space in the binary data buffer",
            );
          }, 500);

          const onBufferAmountLow = () => {
            this._binaryData.removeEventListener(
              "bufferedamountlow",
              onBufferAmountLow,
            );
            clearTimeout(waitTimeout);
            res();
          };

          this._binaryData.addEventListener(
            "bufferedamountlow",
            onBufferAmountLow,
          );
        }),
      );

      if (res.isError()) {
        return result.err(res.error);
      }
    }

    return result.ok(undefined);
  }

  private async waitForGenericBuffer(): Promise<Result<void>> {
    if (this._data.bufferedAmount > this._data.bufferedAmountLowThreshold) {
      const res = await result.fromPromise(
        new Promise<void>((res, rej) => {
          const waitTimeout = setTimeout(() => {
            this._data.removeEventListener(
              "bufferedamountlow",
              onBufferAmountLow,
            );
            rej(
              "Timeout of 500ms exceeded waiting for buffer space for message",
            );
          }, 500);

          const onBufferAmountLow = () => {
            this._data.removeEventListener(
              "bufferedamountlow",
              onBufferAmountLow,
            );
            clearTimeout(waitTimeout);
            res();
          };

          this._data.addEventListener("bufferedamountlow", onBufferAmountLow);
        }),
      );

      if (res.isError()) {
        return result.err(res.error);
      }
    }
    return result.ok(undefined);
  }

  async sendRaw<T extends JsonValue>(
    data: ArrayBuffer,
    metadata?: T,
  ): Promise<Result<void>> {
    const chunks = this._chunker.chunkData(data, metadata);

    for (const chunk of chunks) {
      const waitRes = await this.waitForBinaryBuffer();

      if (waitRes.isError()) {
        return waitRes;
      }

      try {
        this._binaryData.send(chunk);
      } catch (err) {
        return result.err(err as Error);
      }
    }
    return result.ok(undefined);
  }

  async sendFile(file: File): Promise<Result<void>> {
    const fileMetadata: FileMetadata = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
      _internalIsFile: true,
    };

    return this.sendRaw(await file.arrayBuffer(), fileMetadata);
  }

  private async sendClosed() {
    if (this._data.readyState !== "open") {
      return;
    }

    const message = {
      event: INTERNAL_BYE,
      args: [this._peerId],
    } as unknown as InternalMessageEvent<InternalEvents>;

    const waitRes = await this.waitForGenericBuffer();

    if (waitRes.isError()) {
      return;
    }

    try {
      this._data.send(JSON.stringify(message));
    } catch (e) {
      this.callHandlers("error", e as Error);
    }
  }

  async emit<TKey extends keyof ClientToPeerEvents>(
    event: TKey,
    ...args: Parameters<ClientToPeerEvents[TKey]>
  ): Promise<Result<void>> {
    // TODO! handle the creation of this message better so that I don't have to
    // cast `as unknown as T` :puke:.
    const message = {
      event,
      args,
    } as unknown as InternalMessageEvent<ClientToPeerEvents>;

    const waitRes = await this.waitForGenericBuffer();
    if (waitRes.isError()) {
      return waitRes;
    }

    try {
      this._data.send(JSON.stringify(message));
    } catch (e) {
      return result.err(e as Error);
    }
    return result.ok(undefined);
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
      if (this._data.readyState === "closed") {
        res();
        return;
      }
      this._data.onclose = () => res();
    });
    const closeBinaryData = new Promise<void>((res) => {
      if (this._binaryData.readyState === "closed") {
        res();
        return;
      }
      this._binaryData.onclose = () => res();
    });
    const closeConn = new Promise<void>((res) => {
      if (this._connection.connectionState === "closed") {
        res();
        return;
      }
      this._connection.onconnectionstatechange = async (evt) => {
        const connection = evt.target as RTCPeerConnection;
        if (connection.connectionState === "closed") {
          await this.onClosed();
          res();
        }
      };
    });

    await this.sendClosed();
    this._data.close();
    this._binaryData.close();
    this._connection.close();
    await Promise.all([closeData, closeBinaryData, closeConn]);
  }
}
