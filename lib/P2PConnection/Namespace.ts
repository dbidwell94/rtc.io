import { P2PConnection } from './index';
import { UserDefinedTypeMap } from '../Listener';

export class P2PNamespace<T extends UserDefinedTypeMap> {
  private __dataLink: RTCDataChannel;
  constructor(dataLink: RTCDataChannel) {
    this.__dataLink = dataLink;
  }
}
