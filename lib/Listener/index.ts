import { P2PConnection } from '../P2PConnection';
import { ISignalServer } from '../SignalServer/types';

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
  private signalServer: ISignalServer;

  constructor(signalServer: ISignalServer, iceConfig?: RTCConfiguration) {
    this.connections = new Map();
    this.listeners = new Map();
    this.iceConfig = iceConfig || {};
    this.signalServer = signalServer;
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

  connect(roomName: string) {
    this.signalServer.connectToRoom(roomName).then((peers) => {
      if (peers.length > 0) {
        this.connectToPeer(peers[0]);
      } else {
        // this.sendOffer();
      }
    });
  }

  disconnect(roomName: string) {
    this.signalServer.disconnectFromRoom(roomName);
  }

  private removeConnection(connectionId: string) {
    if (this.connections.has(connectionId)) {
      this.connections.get(connectionId)!.clearListeners();
      this.connections.delete(connectionId);
    }
  }

  private async connectToPeer(peer: string) {
    const peerConnection = new RTCPeerConnection(this.iceConfig);
    const peerId = P2PConnection.createP2PId();
    const data = peerConnection.createDataChannel(peerId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    peerConnection.onconnectionstatechange = async () => {
      switch (peerConnection.connectionState) {
        case 'connected': {
          peerConnection.onicecandidate = null;
          const newConnection = new P2PConnection<Evt>(peerConnection, peerId, data);

          // Invoke the connected event
          this.listeners.get('connected')?.forEach((callback) => {
            callback(newConnection);
          });
          this.connections.set(peerId, newConnection);
          break;
        }
        case 'closed': {
          data.close();
          this.removeConnection(peerId);
          break;
        }
        case 'disconnected': {
          break;
        }
      }
    };

    peerConnection.onicecandidate = async () => {
      if (peerConnection.localDescription) {
        this.signalServer.sendOffer(peerConnection.localDescription, peer);
      }
    };
  }
}

export function rtc<Evt extends UserDefinedTypeMap>(
  signalServer: ISignalServer,
  iceConfig?: RTCConfiguration
): Listener<Evt> {
  return new Listener<Evt>(signalServer, iceConfig);
}
