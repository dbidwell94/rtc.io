import { ExternalInternalEventMap } from '.';
import { UserDefinedTypeMap } from '../Listener';

export type IListenerMap<T extends ExternalInternalEventMap> = Map<keyof Partial<T>, Set<Partial<T>[keyof T]>>;

export interface IP2PMessageData<T extends UserDefinedTypeMap> {
  toClientId: string | null;
  fromClientId: string;
  namespace: string | null;
  event: keyof Partial<T>;
  payload: Parameters<T[keyof Partial<T>]>[];
}

type ITypeMap = UserDefinedTypeMap & ExternalInternalEventMap;

export default abstract class Emitter<T extends UserDefinedTypeMap> {
  protected __dataLink: RTCDataChannel;
  protected __listeners: Map<keyof Partial<T>, Set<Partial<T>[keyof T]>>;
  protected __eventQueue: IP2PMessageData<T>[];
  protected __id: string;

  constructor(dataLink: RTCDataChannel, id: string) {
    this.__dataLink = dataLink;
    this.__listeners = new Map();
    this.__eventQueue = [];
    this.__id = id;
    this.initDataChannelListener();
  }

  protected initDataChannelListener() {
    this.__dataLink.onopen = () => {
      this.__eventQueue.forEach((item) => {
        this.__dataLink.send(JSON.stringify(item));
      });
      this.__eventQueue = [];
    };

    this.__dataLink.addEventListener('message', (msg: MessageEvent<string>) => {
      const data = JSON.parse(msg.data) as IP2PMessageData<T>;

      if (data.namespace) return;
      if (this.__listeners.has(data.event)) {
        this.__listeners.get(data.event)!.forEach((callback) => {
          callback && callback(...data.payload);
        });
      }
    });
  }

  public get id() {
    return this.__id;
  }

  public on<E extends keyof ITypeMap, F extends ITypeMap[E]>(event: E, callback: F) {
    if (!this.__listeners.has(event)) {
      this.__listeners.set(event, new Set());
    }
    this.__listeners.get(event)!.add(callback as any);
  }

  public off<E extends keyof ITypeMap, F extends ITypeMap[E]>(event: E, callback: F) {
    if (!this.__listeners.has(event)) return;
    if (!this.__listeners.get(event)!.has(callback as any)) return;
    this.__listeners.get(event)!.delete(callback as any);
    if (!this.__listeners.has(event) || this.__listeners.get(event)!.size < 1) {
      this.__listeners.delete(event);
    }
  }

  public clearListeners() {
    Array.from(this.__listeners.keys()).forEach((event) => {
      this.__listeners.delete(event);
    });
  }

  public emit<E extends keyof ITypeMap, F extends Parameters<ITypeMap[E]>>(event: E, ...args: F) {
    if (this.__dataLink.readyState !== 'open') {
      this.__eventQueue.push(this.createData(event, null, true, null, ...args));
    } else {
      this.__dataLink.send(this.createData(event, null, false, null, ...args));
    }
  }

  protected createData<E extends keyof T, F extends Parameters<T[E]>, B extends boolean>(
    event: E,
    toClientId: string | null,
    shouldOutputObject: B,
    namespace: string | null,
    ...params: F
  ): B extends true ? IP2PMessageData<T> : string {
    const dataToSend = {
      toClientId,
      sendingId: this.id,
      event,
      namespace,
      payload: params,
    };
    if (shouldOutputObject) {
      return dataToSend as any;
    }
    return JSON.stringify(dataToSend) as any;
  }
}
