import { PeerId } from "@rtcio/signaling";
import { BinaryChunker } from "./binaryData";

export interface InternalEvents {
  connectionClosed: (peerId: PeerId) => void;
  data: (binaryData: ArrayBuffer) => void;
  file: (fileBlob: Blob) => void;
}

export type VoidMethods<T> = {
  [K in keyof T as K extends keyof InternalEvents
    ? never
    : T[K] extends (...args: unknown[]) => void
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
    this._chunker = new BinaryChunker();
    this._data.binaryType = "arraybuffer";

    this._data.onmessage = ({ data }) => {
      switch (typeof data) {
        case "string": {
          this.handleStringData(data);
          break;
        }
        case "object": {
          if (data instanceof ArrayBuffer) {
            this.handleBinaryData(data);
            break;
          }
          console.error("Unknown object type received from RTCDataChannel");
          break;
        }
        default: {
          console.error("Unknown data received from RTCDataChannel");
          break;
        }
      }
    };

    this._connection.onconnectionstatechange = () => {
      switch (this._connection.connectionState) {
        case "closed": {
          this.onClosed();
          break;
        }
        default: {
          break;
        }
      }
    };
  }

  private handleBinaryData(data: ArrayBuffer) {
    const optData = this._chunker.receiveChunk(data);

    if (optData.isSome()) {
      this._events["data"]?.forEach((callback) => {
        callback(optData.value);
      });
    }
  }

  private handleStringData(data: string) {
    const messageData: InternalMessageEvent<ClientToPeerEvents> =
      JSON.parse(data);

    // Call all registered persistant events
    this._events[messageData.event]?.forEach((callback) => {
      callback(...messageData.args);
    });

    // Call one shot events and discard afterwards
    this._oneShotEvents[messageData.event]?.forEach((callback) => {
      callback(...messageData.args);
      this._oneShotEvents[messageData.event]?.delete(callback);
    });
  }

  private onClosed() {
    this._events["connectionClosed"]?.forEach((callback) => {
      callback(this._peerId);
    });
  }

  get id() {
    return this._peerId;
  }

  sendRaw(data: ArrayBuffer) {
    this._data.send(data);
  }

  emit<TKey extends keyof ClientToPeerEvents>(
    event: TKey,
    ...args: Parameters<ClientToPeerEvents[TKey]>
  ) {
    // TODO! handle the creation of this message better so that I don't have to
    // cast `as unknown as T` :puke:.
    const message = {
      event,
      args,
    } as unknown as InternalMessageEvent<ClientToPeerEvents>;

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
    await closeData;
    await closeConn;
  }
}
