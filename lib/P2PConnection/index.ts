import { UserDefinedTypeMap } from '@lib/Listener';
import { v1, v4 } from 'uuid';

type P2PConnectionEventMap<T extends UserDefinedTypeMap> = T & {
  disconnected: () => void;
  closed: () => void;
  failed: () => void;
};

interface IP2PMessageData<T extends UserDefinedTypeMap> {
  toClientId: string | null;
  fromClientId: string;
  event: keyof Partial<T>;
  payload: Parameters<T[keyof Partial<T>]>;
}

export class P2PConnection<T extends UserDefinedTypeMap> {
  private __id: string;
  private __connection: RTCPeerConnection;
  private __dataLink: RTCDataChannel;
  private __listeners: Map<keyof Partial<P2PConnectionEventMap<T>>, Set<Partial<P2PConnectionEventMap<T>>[keyof T]>>;

  constructor(conn: RTCPeerConnection, id?: string, link?: RTCDataChannel) {
    this.__id = id || P2PConnection.createP2PId();
    this.__connection = conn;
    if (!link) {
      link = this.__connection.createDataChannel(this.__id);
    }
    this.__dataLink = link;
    this.__listeners = new Map();
    this.initDataChannelListener();
  }

  get id() {
    return this.__id;
  }

  private initDataChannelListener() {
    this.__dataLink.onmessage = (msg: MessageEvent<IP2PMessageData<T>>) => {
      if (this.__listeners.has(msg.data.event)) {
        this.__listeners.get(msg.data.event)!.forEach((callback) => {
          const payload = [...msg.data.payload];
          callback && callback(...payload);
        });
      }
    };
  }

  clearListeners() {
    Array.from(this.__listeners.keys()).forEach((event) => {
      this.__listeners.delete(event);
    });
  }

  on<E extends keyof P2PConnectionEventMap<T>, F extends P2PConnectionEventMap<T>[E]>(event: E, callback: F) {
    if (!this.__listeners.has(event)) {
      this.__listeners.set(event, new Set());
    }
    this.__listeners.get(event)!.add(callback);
  }

  off<E extends keyof P2PConnectionEventMap<T>, F extends P2PConnectionEventMap<T>[E]>(event: E, callback: F) {
    if (!this.__listeners.has(event)) return;
    if (!this.__listeners.get(event)!.has(callback)) return;
    this.__listeners.get(event)!.delete(callback);
    if (!this.__listeners.has(event) || this.__listeners.get(event)!.size < 1) {
      this.__listeners.delete(event);
    }
  }

  emit<E extends keyof T, F extends Parameters<T[E]>>(event: E, ...args: F) {
    this.__dataLink.send(this.createData(event, null, ...args));
  }

  private createData<E extends keyof P2PConnectionEventMap<T>, F extends Parameters<P2PConnectionEventMap<T>[E]>>(
    event: E,
    toClientId: string | null,
    ...params: F
  ): string {
    const dataToSend = {
      toClientId,
      sendingId: this.id,
      event,
      payload: params,
    };
    return JSON.stringify(dataToSend);
  }

  static createP2PId() {
    return `${v1()}${v4()}`.replace(/-/g, '');
  }
}
