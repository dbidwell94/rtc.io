import { P2PConnection } from '../P2PConnection';
import { IRtcSocketIoClient } from '../SignalServer';

export type UserDefinedTypeMap = Record<string, (...args: any) => void>;

interface ListenerEventMap<T extends UserDefinedTypeMap> {
  connected: (connection: P2PConnection<T>, roomName: string) => void;
}

interface IPendingConnectionHost {
  isHost: true;
  id: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
}

interface IPendingConnectionClient {
  isHost: false;
  id: string;
  connection: RTCPeerConnection;
}

class Listener<Evt extends UserDefinedTypeMap = UserDefinedTypeMap> {
  /**
   * A Map where the key is the socket.io id and the value is the P2P connection
   */
  private connections: Map<string, P2PConnection<Evt>>;
  private listeners: Map<keyof ListenerEventMap<Evt>, Set<ListenerEventMap<Evt>[keyof ListenerEventMap<Evt>]>>;
  private iceConfig: RTCConfiguration;
  private signalServer: IRtcSocketIoClient;

  private pendingHostConnections: Map<string, IPendingConnectionHost>;
  private pendingRemoteConnections: Map<string, IPendingConnectionClient>;

  constructor(signalServer: IRtcSocketIoClient, iceConfig?: RTCConfiguration) {
    this.connections = new Map();
    this.listeners = new Map();
    this.iceConfig = iceConfig || {};
    this.signalServer = signalServer;
    this.pendingHostConnections = new Map();
    this.pendingRemoteConnections = new Map();
    this.setupSignalListeners();
  }

  private setupSignalListeners() {
    this.signalServer.on('connectedToChannel', (roomName, peers) => {
      if (peers.length > 0) {
        this.connectToPeer(peers[0], roomName);
      }
    });

    // this.signalServer.on('offerReceived', this.negotiatePeerConnectionWithOffer);

    this.signalServer.on('offerReceived', async (peerId, roomName, offer) => {
      await this.negotiatePeerConnectionWithOffer(peerId, roomName, offer);
    });

    this.signalServer.on('answerReceived', async (fromPeer, answer) => {
      await this.handleRemoteAnswerReceived(fromPeer, answer);
    });
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

  connectToRoom(roomName: string) {
    this.signalServer.emit('requestToJoinChannel', roomName);
  }

  disconnect(roomName: string) {
    this.signalServer.emit('requestToLeaveChannel', roomName);
  }

  private removeConnection(connectionId: string) {
    if (this.connections.has(connectionId)) {
      this.connections.get(connectionId)!.clearListeners();
      this.connections.delete(connectionId);
    }
  }

  private async handleRemoteAnswerReceived(fromPeer: string, answer: RTCSessionDescription) {
    if (!this.pendingHostConnections.has(fromPeer)) return;
    const connection = this.pendingHostConnections.get(fromPeer)!;
    if (connection.connection.signalingState !== 'stable') {
      try {
        await connection.connection.setRemoteDescription(answer);
      } catch (_) {
        // TODO: Handle this error;
      }
    }
  }

  /**
   * A RTCPeerConnection may or may not yet be instantiated. Create one or retrieve it without an RTCDataChannel and send answer to remote peer
   * @param peer The remote socket.io peerID
   * @param offer The remote RTCSessionDescription
   */
  private async negotiatePeerConnectionWithOffer(peer: string, room: string, offer: RTCSessionDescription) {
    let conn: IPendingConnectionClient;
    if (this.pendingRemoteConnections.has(peer)) {
      conn = this.pendingRemoteConnections.get(peer)!;
    } else {
      conn = this.createRemoteConnection(peer, room);
      this.pendingRemoteConnections.set(peer, conn);
    }
    await conn.connection.setRemoteDescription(offer);

    try {
      if (
        conn.connection.signalingState === 'have-remote-offer' ||
        conn.connection.signalingState === 'have-local-pranswer'
      ) {
        const answer = await conn.connection.createAnswer();
        await conn.connection.setLocalDescription(answer);
      }
    } catch (err) {
      // TODO: Handle this error WTF
      // Failed to execute 'setLocalDescription' on 'RTCPeerConnection': Failed to set local answer sdp: Called in wrong state: stable
      // BUT HOW!? I'm checking to make sure it's not in the 'stable' state!
    }
  }

  private createRemoteConnection(peer: string, room: string): IPendingConnectionClient {
    const conn = new RTCPeerConnection(this.iceConfig);
    let dataChannel: RTCDataChannel;

    const handleConnectionStateChange = () => {
      switch (conn.connectionState) {
        case 'connected': {
          conn.removeEventListener('connectionstatechange', handleConnectionStateChange);
          const handleDataChannel = (evt: RTCDataChannelEvent) => {
            dataChannel = evt.channel;
            const myConnectionObject = this.pendingRemoteConnections.get(peer)!;
            this.pendingRemoteConnections.delete(peer);
            const p2pConnection = new P2PConnection<Evt>(myConnectionObject.connection, dataChannel.label, dataChannel);
            this.connections.set(peer, p2pConnection);
            conn.removeEventListener('datachannel', handleDataChannel);

            if (this.listeners.has('connected')) {
              this.listeners.get('connected')?.forEach((callback) => {
                callback(p2pConnection, room);
              });
            }
          };
          conn.addEventListener('datachannel', handleDataChannel);
          break;
        }

        case 'failed': {
          conn.close();
          break;
        }

        case 'closed': {
          dataChannel?.close();
          this.removeConnection(peer);
        }
      }
    };
    conn.addEventListener('connectionstatechange', handleConnectionStateChange);

    const onIce = async () => {
      if (!conn.localDescription) return;
      this.signalServer.emit('rtcAnswer', peer, conn.localDescription, room);
    };

    conn.addEventListener('icecandidate', onIce);

    return {
      connection: conn,
      id: P2PConnection.createP2PId(),
      isHost: false,
    };
  }

  /**
   * Sends offer to the remote peer via the Signal Server
   * @param peer The ID of the peer as per the Signal Server
   */
  private async connectToPeer(peer: string, roomName: string) {
    const peerConnection = new RTCPeerConnection(this.iceConfig);
    const peerId = P2PConnection.createP2PId();
    const data = peerConnection.createDataChannel(peerId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    peerConnection.addEventListener('connectionstatechange', async () => {
      switch (peerConnection.connectionState) {
        case 'connected': {
          peerConnection.onicecandidate = null;
          const newConnection = new P2PConnection<Evt>(peerConnection, peerId, data, [roomName]);

          // Invoke the connected event
          this.listeners.get('connected')?.forEach((callback) => {
            callback(newConnection, roomName);
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
        case 'failed': {
          peerConnection.close();
          break;
        }
      }
    });

    peerConnection.onicecandidate = async () => {
      if (peerConnection.localDescription) {
        this.signalServer.emit('rtcOffer', peer, peerConnection.localDescription, roomName);
      }
    };

    this.pendingHostConnections.set(peer, { isHost: true, connection: peerConnection, id: peerId, dataChannel: data });
  }
}

/**
 *
 * @param {IRtcSocketIoClient} signalServer A typed socket.io-client instance used for signaling.
 * @param {RTCConfiguration | undefined} iceConfig The ice config used for STUN / TURN negotiation with a remote peer
 * @returns {Listener<Evt>} An instance of the Listener class which can be used to manage RTC Peer connections with easy-to-use callback chaining
 */
export function rtc<Evt extends UserDefinedTypeMap>(
  signalServer: IRtcSocketIoClient,
  iceConfig?: RTCConfiguration
): Listener<Evt> {
  return new Listener<Evt>(signalServer, iceConfig);
}
