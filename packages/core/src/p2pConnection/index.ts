import { PeerId } from "@rtcio/signaling";

export interface InternalEvents {
  connectionClosed: (peerId: PeerId) => void;
}

export type VoidMethods<T> = {
  [K in keyof T]: T extends keyof InternalEvents
    ? never
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      T[K] extends (...args: any[]) => void
      ? T[K]
      : never;
};

export type EventMap<T> = VoidMethods<T> & InternalEvents;

interface InternalMessageEvent<Evts> {
  event: keyof VoidMethods<Evts>;
  args: Parameters<VoidMethods<Evts>[keyof VoidMethods<Evts>]>;
}

export class P2PConnection<ClientToPeerEvents> {
  private _events: {
    [K in keyof EventMap<ClientToPeerEvents>]?: Set<
      EventMap<ClientToPeerEvents>[K]
    >;
  } = Object.create(null);

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

    this._data.onmessage = ({ data }) => {
      const messageData: InternalMessageEvent<ClientToPeerEvents> =
        JSON.parse(data);

      this._events[messageData.event]?.forEach((callback) => {
        callback(...messageData.args);
      });
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

  private onClosed() {
    this._events["connectionClosed"]?.forEach((callback) => {
      callback(this._peerId);
    });
  }

  get id() {
    return this._peerId;
  }

  emit<TKey extends string & keyof ClientToPeerEvents>(
    event: TKey,
    ...args: Parameters<VoidMethods<ClientToPeerEvents>[TKey]>
  ) {
    const message: InternalMessageEvent<ClientToPeerEvents> = {
      event,
      args,
    };

    this._data.send(JSON.stringify(message));
  }

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
