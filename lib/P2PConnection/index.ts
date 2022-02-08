import { UserDefinedTypeMap } from '@lib/Listener';
import { v1, v4 } from 'uuid';

type InternalEventMap = UserDefinedTypeMap & {
  syncClientId: (clientId: string) => void;
};

type ExternalInternalEventMap = {
  disconnected: () => void;
  closed: () => void;
  failed: () => void;
};

type MergedInternalEventMap = InternalEventMap & ExternalInternalEventMap;

type P2PConnectionEventMap<T extends UserDefinedTypeMap> = T & ExternalInternalEventMap;

interface IP2PMessageData<T extends UserDefinedTypeMap> {
  toClientId: string | null;
  fromClientId: string;
  event: keyof Partial<T>;
  payload: Parameters<T[keyof Partial<T>]>[];
}

export class P2PConnection<T extends UserDefinedTypeMap> {
  private __id: string;
  private __connectedRooms: string[];
  private __connection: RTCPeerConnection;
  private __dataLink: RTCDataChannel;
  private __listeners: Map<keyof Partial<P2PConnectionEventMap<T>>, Set<Partial<P2PConnectionEventMap<T>>[keyof T]>>;
  private __internalListeners: Map<
    keyof Partial<MergedInternalEventMap>,
    Set<Partial<MergedInternalEventMap>[keyof MergedInternalEventMap]>
  >;
  private __eventQueue: IP2PMessageData<T>[];

  constructor(conn: RTCPeerConnection, id?: string, link?: RTCDataChannel, connectedRooms?: string[]) {
    this.__id = id || P2PConnection.createP2PId();
    this.__connection = conn;
    if (!link) {
      link = this.__connection.createDataChannel(this.__id);
    }
    if (!connectedRooms) {
      connectedRooms = [];
    }
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

  get id() {
    return this.__id;
  }

  private initDataChannelListener() {
    this.__dataLink.onopen = () => {
      this.__eventQueue.forEach((item) => {
        this.__dataLink.send(JSON.stringify(item));
      });
      this.__eventQueue = [];
    };

    this.__dataLink.onmessage = (msg: MessageEvent<string>) => {
      const data = JSON.parse(msg.data) as IP2PMessageData<T | MergedInternalEventMap>;
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
    };
  }

  private initPeerConnectionListener() {
    this.__connection.addEventListener('iceconnectionstatechange', () => {
      switch (this.__connection.iceConnectionState) {
        case 'disconnected': {
          this.__invokeEvent('disconnected');
          this.__connection.close();
          this.__dataLink.close();
          break;
        }

        case 'failed': {
          this.__invokeEvent('failed');
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

  emit<E extends keyof T, F extends Parameters<T[E]>>(event: E, ...args: F) {
    if (this.__dataLink.readyState !== 'open') {
      this.__eventQueue.push(this.createData(event, null, true, ...args));
    } else {
      this.__dataLink.send(this.createData(event, null, false, ...args));
    }
  }

  private __invokeEvent<E extends keyof MergedInternalEventMap, P extends Parameters<MergedInternalEventMap[E]>>(
    event: E,
    ...params: P
  ) {
    if (this.__listeners.get(event)) {
      this.__listeners.get(event)!.forEach((callback) => {
        callback && callback(...(params as any));
      });
    }
  }

  private createData<
    E extends keyof P2PConnectionEventMap<T>,
    F extends Parameters<P2PConnectionEventMap<T>[E]>,
    B extends boolean
  >(event: E, toClientId: string | null, outputObject: B, ...params: F): B extends true ? IP2PMessageData<T> : string {
    const dataToSend = {
      toClientId,
      sendingId: this.id,
      event,
      payload: params,
    };
    if (outputObject) {
      return dataToSend as any;
    }
    return JSON.stringify(dataToSend) as any;
  }

  static createP2PId() {
    return `${v1()}${v4()}`.replace(/-/g, '');
  }
}
