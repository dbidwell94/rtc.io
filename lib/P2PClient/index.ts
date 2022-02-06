import { v1, v4 } from 'uuid';
import { ISignalServer } from '../SignalServer/types';
import { INotConnected, IConnected, IP2PConfig } from './types';
import { P2PError } from './P2PError';

export class P2PConnection {
  private __pendingRemoteConnections: Set<INotConnected>;
  private __pendingLocalConnections: Set<IConnected>;

  /**
   * A map where the key is the remote connection id and the value is the connection
   */
  private __connections: Map<string, IConnected>;
  private __id: string;
  private __rtcConfig: RTCConfiguration;
  private __signalServer: ISignalServer;

  constructor(signalServer: ISignalServer, config?: IP2PConfig) {
    this.__signalServer = signalServer;
    this.__connections = new Map();
    this.__pendingLocalConnections = new Set();
    this.__pendingRemoteConnections = new Set();
    this.__id = `${v1()}${v4()}`.replace(/-/g, '');
    this.__rtcConfig = config?.rtcConfig || {};
  }

  // private async waitForEvent() {}

  private async createLocalConnection() {
    const conn = new RTCPeerConnection(this.__rtcConfig);
    const data = conn.createDataChannel(this.id);
    const offer = await conn.createOffer();
    conn.onicecandidate = async () => await this.sendLocalDescription(conn);

    conn.onconnectionstatechange = () => {
      switch (conn.connectionState) {
        case 'failed': {
          // TODO: handle the failed connection
          break;
        }
        case 'connected': {
          conn.onicecandidate = null;
          // TODO: send id to remote client to sync
          break;
        }
        case 'disconnected': {
          conn.close();
          data.close();
          // TODO: remove the connection from the class's connection pool
        }
      }
    };
    await conn.setLocalDescription(offer);
  }

  private async sendLocalDescription(conn: RTCPeerConnection) {
    if (conn.localDescription) {
      await this.__signalServer.sendLocalDescription(conn.localDescription);
    }
  }

  get id() {
    return this.__id;
  }
}

export { ISignalServer } from '../SignalServer/types';
export { IP2PConfig } from './types';
