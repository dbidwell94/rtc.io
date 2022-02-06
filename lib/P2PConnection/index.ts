import { UserDefinedTypeMap } from '@lib/Listener';
import { v1, v4 } from 'uuid';

type P2PConnectionEventMap<T extends UserDefinedTypeMap> = T & {
  disconnected: () => void;
  closed: () => void;
  failed: () => void;
};

export class P2PConnection<T extends UserDefinedTypeMap> {
  private __id: string;
  private __connection: RTCPeerConnection;
  private __dataLink: RTCDataChannel;
  private __listeners: Map<
    keyof Partial<P2PConnectionEventMap<T>>,
    Set<Partial<P2PConnectionEventMap<T>>[keyof Partial<P2PConnectionEventMap<T>>]>
  >;

  constructor(conn: RTCPeerConnection, id?: string, link?: RTCDataChannel) {
    this.__id = id || P2PConnection.createP2PId();
    this.__connection = conn;
    if (!link) {
      link = this.__connection.createDataChannel(this.__id);
    }
    this.__dataLink = link;
    this.__listeners = new Map();
  }

  get id() {
    return this.__id;
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

  static createP2PId() {
    return `${v1()}${v4()}`.replace(/-/g, '');
  }
}
