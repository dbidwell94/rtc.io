import { P2PConnection } from '../P2PConnection';

export interface UserDefinedTypeMap {
  [key: string]: any;
}

interface ListenerEventMap<T extends UserDefinedTypeMap> {
  connected: (connection: P2PConnection<T>) => void;
}

class Listener<Evt extends UserDefinedTypeMap = UserDefinedTypeMap> {
  private connections: Map<string, P2PConnection<Evt>>;
  private listeners: Map<keyof ListenerEventMap<Evt>, Set<ListenerEventMap<Evt>[keyof ListenerEventMap<Evt>]>>;
  private iceConfig: RTCConfiguration;
  private temporaryConnection: RTCPeerConnection | null = null;

  constructor(iceConfig?: RTCConfiguration) {
    this.connections = new Map();
    this.listeners = new Map();
    this.iceConfig = iceConfig || {};
  }

  on<E extends keyof ListenerEventMap<Evt>, F extends ListenerEventMap<Evt>[E]>(event: E, callback: F) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<E extends keyof ListenerEventMap<Evt>, F extends ListenerEventMap<Evt>[E]>(event: E, callback: F) {
    if (!this.listeners.has(event)) return;
    if (!this.listeners.get(event)!.has(callback)) return;
    this.listeners.get(event)!.delete(callback);
    if (!this.listeners.has(event) || this.listeners.get(event)!.size < 1) {
      this.listeners.delete(event);
    }
  }
}

export function rtc<Evt extends UserDefinedTypeMap>(iceConfig?: RTCConfiguration): Listener<Evt> {
  return new Listener<Evt>(iceConfig);
}
