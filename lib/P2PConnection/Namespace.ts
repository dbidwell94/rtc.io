import { UserDefinedTypeMap } from '../Listener';
import Emitter, { IP2PMessageData } from './Emitter';

export default class P2PNamespace<T extends UserDefinedTypeMap> extends Emitter<T> {
  private __namespace: string;
  constructor(dataLink: RTCDataChannel, id: string, builder: P2PNamespaceBuilder<T>) {
    super(dataLink, id);
    this.__namespace = builder.namespace;
    this.__listeners = builder.listeners;
  }

  protected override initDataChannelListener() {
    this.__dataLink.onopen = () => {
      this.__eventQueue.forEach((item) => {
        this.__dataLink.send(JSON.stringify(item));
      });
      this.__eventQueue = [];
    };

    this.__dataLink.addEventListener('message', (msg: MessageEvent<string>) => {
      const data = JSON.parse(msg.data) as IP2PMessageData<T>;

      if (data.namespace !== this.namespace) return;
      if (this.__listeners.has(data.event)) {
        this.__listeners.get(data.event)!.forEach((callback) => {
          callback && callback(...data.payload);
        });
      }
    });
  }

  public get namespace() {
    return this.__namespace;
  }
}

export class P2PNamespaceBuilder<T extends UserDefinedTypeMap> extends Emitter<T> {
  private __namespace: string;
  constructor(namespace: string) {
    super({} as any, '');
    this.__namespace = namespace;
  }

  public get namespace() {
    return this.__namespace;
  }

  public get listeners() {
    return this.__listeners;
  }

  protected override initDataChannelListener(): void {
    return;
  }
}

type IP2PBuilderGenerator<T extends UserDefinedTypeMap> = (builder: P2PNamespaceBuilder<T>) => P2PNamespaceBuilder<T>;

export function createNamespace<T extends UserDefinedTypeMap>(
  namespace: string,
  builder: IP2PBuilderGenerator<T>
): P2PNamespaceBuilder<T> {
  const toInject = new P2PNamespaceBuilder<T>(namespace);
  const toReturn = builder(toInject);
  return toReturn;
}
