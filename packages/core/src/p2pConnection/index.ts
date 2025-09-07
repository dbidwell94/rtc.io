import { PeerId } from "@rtcio/signaling";
import {
  BinaryChunker,
  BinaryChunkerOptions,
  JsonObject,
  JsonValue,
} from "./binaryData";
import { Option, result, Result } from "@dbidwell94/ts-utils";
import Logger from "@rtcio/logger";

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

  #logger: Logger;

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
    this.#logger = new Logger(
      "rtcio:core",
      P2PConnection.name,
      peerId.substring(0, 8),
    );

    this.#logger.log("P2PConnection created with the following options: %o", {
      dataTimeout: `${dataTimeout}ms`,
      maxChunkSize: `${maxChunkSize} bytes`,
    });

    this._connection = connection;
    this._peerId = peerId;
    this._data = genericDataChannel;
    this._binaryData = binaryDataChannel;
    this._chunker = new BinaryChunker({
      onDataTimeout: this.onDataTimedOut,
      dataTimeout,
      maxChunkSize,
      instanceId: peerId.substring(0, 8),
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
      this.#logger.error("Unknown data received from binary RTCDataChannel");
      await this.emitError(
        new Error("Unknown data received from binary RTCDataChannel"),
      );
    };

    this._data.onmessage = async ({ data }) => {
      if (typeof data !== "string") {
        this.#logger.error("Unknown data received from generic RTCDataChannel");
        await this.emitError(
          new Error("Unknown data received from generic RTCDataChannel"),
        );
        return;
      }

      await this.handleStringData(data);
    };

    this._connection.onconnectionstatechange = async (evt) => {
      const connection = evt.target as RTCPeerConnection;
      this.#logger.verbose(
        "RTCPeerConnection connection state change: {%s}",
        connection.connectionState,
      );
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
    this.#logger.warn(
      "Data has timed out. Informing handlers. DataId: {%s}",
      dataId,
    );
    this.callHandlers("dataTimedOut", dataId);
  }

  private async emitError(error: Error) {
    this.#logger.verbose("Error received. Informing handlers");
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
    this.#logger.verbose("callHandlers");
    let eventsCallCount = 0;
    for (const callback of this._events[key] ?? []) {
      this.#logger.verbose(
        "Calling persistant handlers for event: {%s} -- count: %s time(s)",
        key,
        ++eventsCallCount,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await callback(...(args as any[]));
    }

    let oneShotCallCount = 0;
    for (const callback of this._oneShotEvents[key] ?? []) {
      this.#logger.verbose(
        "Calling one shot handlers for event: {%s} -- count: %s time(s)",
        key,
        ++oneShotCallCount,
      );
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
      this.#logger.log("Received a new file stream. Details: %o", {
        type: optMetadata.value.type,
        size: optMetadata.value.size,
        name: optMetadata.value.name,
      });
      this.handleFileStream(id, optMetadata.value);
    }

    if (optData.isSome()) {
      this.#logger.log(
        "Finished data reconstruction for dataId: {%s}",
        id.substring(0, 8),
      );
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
    this.#logger.verbose("handleFileStream -- dataId: {%s}", fileId);
    const mainStreamResult = this._chunker.setDataIsStream(fileId);

    if (mainStreamResult.isError()) {
      this.#logger.error(
        "An error occurred in the file stream for dataId: {%s} -- %o",
        fileId,
        mainStreamResult.error,
      );
      this.emitError(mainStreamResult.error);
      return;
    }

    const mainStream = mainStreamResult.value;

    const listeners: Array<EventMap<ClientToPeerEvents>["fileStream"]> =
      Array.from(this._events["fileStream"] ?? []).concat(
        Array.from(this._oneShotEvents["fileStream"] ?? []),
      );

    this.#logger.verbose(
      "Found %s listeners for the `fileStream` event. dataId: {%s}",
      listeners.length,
      fileId,
    );

    if (listeners.length === 1) {
      this.#logger.verbose(
        "Only one listener for `fileStream`, not teeing data. dataId: {%s}",
        fileId,
      );
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

      this.#logger.verbose(
        "Multiple listeners for `fileStream` detected. Splitting into %s streams for dataId",
        streams.length,
        fileId,
      );

      listeners.forEach((callback, index) => {
        callback(metadata, streams[index]);
        this._oneShotEvents["fileStream"]?.delete(callback);
      });
    }
  }

  private async handleStringData(data: string) {
    this.#logger.verbose("handleStringData");
    try {
      const messageData: InternalMessageEvent<ClientToPeerEvents> =
        JSON.parse(data);

      this.#logger.verbose(
        "Parsed message data for event: {%s}",
        messageData.event,
      );

      if (messageData.event === INTERNAL_BYE) {
        await this.close();
        return;
      }

      await this.callHandlers(messageData.event, ...messageData.args);
    } catch (err) {
      this.#logger.error("Error during message data parsing: %o", err);
      await this.callHandlers("error", err as Error);
    }
  }

  private async onClosed() {
    this.#logger.verbose("onClosed");
    if (this._calledCloseHandlers) {
      this.#logger.verbose("All handlers have already been called");
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
    this.#logger.verbose("waitForBinaryBuffer");
    if (
      this._binaryData.bufferedAmount >
      this._binaryData.bufferedAmountLowThreshold
    ) {
      this.#logger.verbose("Binary buffer shows low. Waiting for space");
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
            this.#logger.verbose("Binary data buffer space is now available");
            res();
          };

          this._binaryData.addEventListener(
            "bufferedamountlow",
            onBufferAmountLow,
          );
        }),
      );

      if (res.isError()) {
        this.#logger.error(
          "An error occurred waiting for binary buffer space. %o",
          res.error,
        );
        return result.err(res.error);
      }
    }

    return result.ok(undefined);
  }

  private async waitForGenericBuffer(): Promise<Result<void>> {
    this.#logger.verbose("waitForGenericBuffer");
    if (this._data.bufferedAmount > this._data.bufferedAmountLowThreshold) {
      this.#logger.verbose("Generic buffer shows low. Waiting for space");
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
            this.#logger.verbose("Generic data buffer space is now available");
            res();
          };

          this._data.addEventListener("bufferedamountlow", onBufferAmountLow);
        }),
      );

      if (res.isError()) {
        this.#logger.error(
          "An error occurred waiting for generic buffer space. %o",
          res.error,
        );
        return result.err(res.error);
      }
    }
    return result.ok(undefined);
  }

  async sendRaw<T extends JsonValue>(
    data: ArrayBuffer,
    metadata?: T,
  ): Promise<Result<void>> {
    this.#logger.verbose("sendRaw");
    const chunks = this._chunker.chunkData(data, metadata);
    this.#logger.log("Starting binary data transfer");

    for await (const chunk of chunks) {
      const waitRes = await this.waitForBinaryBuffer();

      if (waitRes.isError()) {
        // no need to log here, we already log in waitForBinaryBuffer
        return waitRes;
      }

      try {
        this.#logger.verbose("Sending data via the Binary RTCDataChannel");
        this._binaryData.send(chunk);
      } catch (err) {
        this.#logger.error("An error occurred sending binary data. %o", err);
        return result.err(err as Error);
      }
    }
    this.#logger.log("Finished sending binary data");
    return result.ok(undefined);
  }

  async sendFile(file: File): Promise<Result<void>> {
    this.#logger.verbose("sendFile");
    const fileMetadata: FileMetadata = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
      _internalIsFile: true,
    };
    this.#logger.log("Sending a file via the Binary RTCDataChannel: %o", {
      name: fileMetadata.name,
      size: fileMetadata.size,
      type: fileMetadata.type,
    });

    return this.sendRaw(await file.arrayBuffer(), fileMetadata);
  }

  private async sendClosed() {
    this.#logger.verbose("sendClosed");
    if (this._data.readyState !== "open") {
      this.#logger.verbose(
        "Generic RTCDataChannel is already closed. Halting process",
      );
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
      this.#logger.error(
        "An error occurred sending GOODBYE packet to peer. %o",
        e,
      );
      this.callHandlers("error", e as Error);
    }
  }

  async emit<TKey extends keyof ClientToPeerEvents>(
    event: TKey,
    ...args: Parameters<ClientToPeerEvents[TKey]>
  ): Promise<Result<void>> {
    this.#logger.verbose("emit");
    // TODO! handle the creation of this message better so that I don't have to
    // cast `as unknown as T` :puke:.
    const message = {
      event,
      args,
    } as unknown as InternalMessageEvent<ClientToPeerEvents>;
    this.#logger.verbose("Emitting event to remote peer. Event: %s", event);

    const waitRes = await this.waitForGenericBuffer();
    if (waitRes.isError()) {
      return waitRes;
    }

    try {
      this._data.send(JSON.stringify(message));
    } catch (e) {
      this.#logger.error(
        "An error occurred emitting event to remote peer. Event: %s %o",
        event,
        e,
      );
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
    this.#logger.log("Registering one-shot event for event: %s", event);
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
    this.#logger.log(
      "Registering persistant event listener for event: %s",
      event,
    );
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
      this.#logger.log("Removed event listener for event: %s", event);
      this._events[event].delete(handler);
    } else {
      this.#logger.warn(
        "Attempted to remove an event listener for event {%s} " +
          "but callback could not be located in the event map. " +
          "This may indicate a memory leak and should be addressed",
        event,
      );
    }
  }

  async close() {
    this.#logger.verbose("close");
    this.#logger.log(
      "Request to close P2PConnection received. Beginning cleanup",
    );
    const closeData = new Promise<void>((res) => {
      if (this._data.readyState === "closed") {
        this.#logger.log("Generic RTCDataChannel already closed.");
        res();
        return;
      }
      this._data.onclose = () => {
        this.#logger.log(
          "Generic RTCDataChannel connection successfully closed.",
        );
        res();
      };
    });
    const closeBinaryData = new Promise<void>((res) => {
      if (this._binaryData.readyState === "closed") {
        this.#logger.log("Binary RTCDataChannel already closed.");
        res();
        return;
      }
      this._binaryData.onclose = () => {
        this.#logger.log(
          "Binary RTCDataChannel connection successfully closed.",
        );
        res();
      };
    });
    const closeConn = new Promise<void>((res) => {
      if (this._connection.connectionState === "closed") {
        this.#logger.log("RTCPeerConnection already closed.");
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
