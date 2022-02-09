import { UserDefinedTypeMap } from '../Listener';
import Emitter, { IListenerMap } from '../P2PConnection/Emitter';
import { v1, v4 } from 'uuid';

type InternalEventMap = UserDefinedTypeMap & {
  syncClientId: (clientId: string) => void;
};

export type ExternalInternalEventMap = {
  disconnected: () => void;
  closed: () => void;
  failed: () => void;
};

type MergedInternalEventMap = InternalEventMap & ExternalInternalEventMap;

interface IP2PMessageData<T extends UserDefinedTypeMap> {
  toClientId: string | null;
  fromClientId: string;
  namespace: string | null;
  event: keyof Partial<T>;
  payload: Parameters<T[keyof Partial<T>]>[];
}

export class P2PConnection<T extends UserDefinedTypeMap> extends Emitter<T> {
  private __connectedRooms: string[];
  private __connection: RTCPeerConnection;
  private __internalListeners: IListenerMap<MergedInternalEventMap>;

  constructor(conn: RTCPeerConnection, id: string, link: RTCDataChannel, connectedRooms?: string[]) {
    super(link, id);
    if (!connectedRooms) {
      connectedRooms = [];
    }

    this.__connection = conn;
    this.__dataLink = link;
    this.__listeners = new Map();
    this.__internalListeners = new Map();
    this.__eventQueue = [];
    this.initDataChannelListener();
    this.initPeerConnectionListener();
    this.__connectedRooms = connectedRooms;
  }

  get connectedRooms(): string[] {
    return this.__connectedRooms;
  }

  protected initDataChannelListener() {
    this.__dataLink.onopen = () => {
      this.__eventQueue.forEach((item) => {
        this.__dataLink.send(JSON.stringify(item));
      });
      this.__eventQueue = [];
    };

    this.__dataLink.addEventListener('message', (msg: MessageEvent<string>) => {
      const data = JSON.parse(msg.data) as IP2PMessageData<T | MergedInternalEventMap>;
      // TODO: Handle custom namespace events
      if (data.namespace) return;
      if (this.__listeners.has(data.event)) {
        this.__listeners.get(data.event)!.forEach((callback) => {
          callback && callback(...data.payload);
        });
      } else if (this.__internalListeners.has(data.event)) {
        const internalMsg = data as IP2PMessageData<MergedInternalEventMap>;
        this.__internalListeners.get(internalMsg.event)!.forEach((callback) => {
          callback && callback(...internalMsg.payload);
        });
      }
    });
  }

  private initPeerConnectionListener() {
    this.__connection.addEventListener('iceconnectionstatechange', () => {
      switch (this.__connection.iceConnectionState) {
        case 'disconnected': {
          this.invokeEvent('disconnected');
          this.__connection.close();
          this.__dataLink.close();
          break;
        }

        case 'failed': {
          this.invokeEvent('failed');
          this.__connection.close();
          this.__dataLink.close();
          break;
        }
      }
    });

    const syncClientId = (id: string) => {
      this.__id = id;
      this.internalOff('syncClientId', syncClientId);
    };

    this.internalOn('syncClientId', syncClientId);
  }

  clearListeners() {
    Array.from(this.__listeners.keys()).forEach((event) => {
      this.__listeners.delete(event);
    });
  }

  private internalOn<E extends keyof MergedInternalEventMap, F extends MergedInternalEventMap[E]>(
    event: E,
    callback: F
  ) {
    if (!this.__internalListeners.has(event)) {
      this.__internalListeners.set(event, new Set());
    }
    this.__internalListeners.get(event)!.add(callback);
  }

  private internalOff<E extends keyof MergedInternalEventMap, F extends MergedInternalEventMap[E]>(
    event: E,
    callback: F
  ) {
    if (!this.__internalListeners.has(event)) return;
    if (!this.__internalListeners.get(event)!.has(callback)) return;
    this.__internalListeners.get(event)!.delete(callback);
    if (!this.__internalListeners.has(event) || this.__internalListeners.get(event)!.size < 1) {
      this.__internalListeners.delete(event);
    }
  }

  private invokeEvent<E extends keyof MergedInternalEventMap, P extends Parameters<MergedInternalEventMap[E]>>(
    event: E,
    ...params: P
  ) {
    if (this.__listeners.get(event)) {
      this.__listeners.get(event)!.forEach((callback) => {
        callback && callback(...(params as any));
      });
    }
  }

  static createP2PId() {
    return `${v1()}${v4()}`.replace(/-/g, '');
  }
}
