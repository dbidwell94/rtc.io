import { UserDefinedTypeMap } from '@lib/Listener';
import { v1, v4 } from 'uuid';

export class P2PConnection<T extends UserDefinedTypeMap> {
  private __id: string;
  private __connection: RTCPeerConnection;
  private __dataLink: RTCDataChannel;
  private __listeners: Map<keyof T, Set<T[keyof T]>>;

  constructor(conn: RTCPeerConnection, link?: RTCDataChannel) {
    this.__id = `${v1()}${v4()}`.replace(/-/g, '');
    this.__connection = conn;
    if (!link) {
      link = this.__connection.createDataChannel(this.__id);
    }
    this.__dataLink = link;
    this.__listeners = new Map();
  }

  on<E extends keyof T, F extends T[E]>(event: E, callback: F) {
    if (!this.__listeners.has(event)) {
      this.__listeners.set(event, new Set());
    }
    this.__listeners.get(event)!.add(callback);
  }

  off<E extends keyof T, F extends T[E]>(event: E, callback: F) {
    if (!this.__listeners.has(event)) return;
    if (!this.__listeners.get(event)!.has(callback)) return;
    this.__listeners.get(event)!.delete(callback);
    if (!this.__listeners.has(event) || this.__listeners.get(event)!.size < 1) {
      this.__listeners.delete(event);
    }
  }
}
