import { P2PConnection, VoidMethods } from "./p2pConnection";
import { ClientSignaler, UUID } from "./signaling";
import { Option, option, Result, result } from "@dbidwell94/ts-utils";

const freeIceServers = [
  "stun:stun.l.google.com:19302",
  "stun:stun.l.google.com:5349",
  "stun:stun1.l.google.com:3478",
  "stun:stun1.l.google.com:5349",
  "stun:stun2.l.google.com:19302",
  "stun:stun2.l.google.com:5349",
  "stun:stun3.l.google.com:3478",
  "stun:stun3.l.google.com:5349",
  "stun:stun4.l.google.com:19302",
  "stun:stun4.l.google.com:5349",
];

interface RemoteOffer {
  /**
   * This is the remote ID of the incoming offer.
   */
  remoteId: UUID;
  /**
   * If called, this will start the P2P connection process.
   */
  accept: () => Promise<Result<void>>;
  /**
   * If called, this will reject the incoming connection.
   */
  reject: () => void;
}

interface InternalEvents<
  ClientToPeerEvents extends VoidMethods<ClientToPeerEvents>,
> {
  connected: (peer: P2PConnection<ClientToPeerEvents>) => void;
  connectionFailed: (peerId: UUID) => void;
  connectionRequest: (offer: RemoteOffer) => void;
}

interface PeerState {
  connection: RTCPeerConnection;
  data: Option<RTCDataChannel>;
}

export class RTC<ClientToPeerEvent extends VoidMethods<ClientToPeerEvent>> {
  private _pendingPeers: Map<UUID, PeerState>;
  private _connectedPeers: Map<UUID, P2PConnection<ClientToPeerEvent>>;
  private _signalingInterface: ClientSignaler;
  private _roomName: string;
  private _roomPeerId: Option<UUID>;
  private _iceServers: RTCIceServer[];

  private _events: {
    [K in keyof InternalEvents<ClientToPeerEvent>]?: Array<
      InternalEvents<ClientToPeerEvent>[K]
    >;
  } = Object.create(null);

  constructor(
    signalingInterface: ClientSignaler,
    roomName: string,
    iceServers: RTCIceServer[] = [
      {
        urls: freeIceServers,
      },
    ],
  ) {
    this._iceServers = iceServers;
    this._pendingPeers = new Map();
    this._connectedPeers = new Map();
    this._roomName = roomName;
    this._roomPeerId = option.none();
    this._signalingInterface = signalingInterface;
    this.setupListeners();
  }

  private setupListeners() {
    this._signalingInterface.on("offer", (sender, offer) => {
      this._events["connectionRequest"]?.forEach((offerCallback) => {
        offerCallback({
          remoteId: sender,
          accept: () => {
            return this.acceptOffer(sender, offer);
          },
          reject: () => {},
        });
      });
    });
  }

  public on<TKey extends string & keyof InternalEvents<ClientToPeerEvent>>(
    event: TKey,
    handler: InternalEvents<ClientToPeerEvent>[TKey],
  ) {
    if (this._events[event]) {
      this._events[event].push(handler);
    } else {
      // TODO! - Fix the typing here so I don't have to cast as `never`
      this._events[event] = [handler] as never;
    }
  }

  /**
   * Facilitates the connection to the signaling server.
   */
  public async connect() {
    const myPeerId = await this._signalingInterface.connectToRoom(
      this._roomName,
    );

    this._roomPeerId = option.some(myPeerId);
  }

  /**
   * Gets a list of the peers from the signaling server in the current room.
   */
  public getRoomPeers(): Array<UUID> {
    if (this._roomPeerId.isNone()) {
      return [];
    }
    const myId = this._roomPeerId.value;
    return this._signalingInterface
      .getRoomPeers()
      .filter((peer) => peer !== myId);
  }

  private onAnswer(peerId: UUID, connection: RTCPeerConnection) {
    return async (sender: UUID, answer: RTCSessionDescriptionInit) => {
      if (sender !== peerId) return;

      await connection.setRemoteDescription(answer);
    };
  }

  private onIceCandidate(peerId: UUID, connection: RTCPeerConnection) {
    return async (sender: UUID, ice: RTCIceCandidateInit) => {
      if (sender !== peerId) return;

      await connection.addIceCandidate(ice);
    };
  }

  private onConnectionStateChanged(peerId: UUID) {
    const peerStateOpt = option.unknown(this._pendingPeers.get(peerId));

    if (peerStateOpt.isNone()) return () => {};

    const { connection, data } = peerStateOpt.value;

    const sendOff = (dataChannel: RTCDataChannel) => {
      dataChannel.onopen = null;
      this._events["connected"]?.forEach((callback) => {
        const clientConnection = new P2PConnection<ClientToPeerEvent>(
          connection,
          dataChannel,
          peerId,
        );
        this._pendingPeers.delete(peerId);
        this._connectedPeers.set(peerId, clientConnection);
        callback(clientConnection);
      });
    };

    return async () => {
      switch (connection.connectionState) {
        case "connected": {
          // Make sure the data channel is also ready before handing off
          if (data.isNone()) {
            return;
          }
          const dataChannel = data.value;

          if (dataChannel.readyState !== "open") {
            dataChannel.onopen = () => {
              sendOff(dataChannel);
            };
          } else {
            sendOff(dataChannel);
          }
          break;
        }
        case "failed": {
          this._events["connectionFailed"]?.forEach((callback) =>
            callback(peerId),
          );
          break;
        }
        default: {
          break;
        }
      }
    };
  }

  private async acceptOffer(
    peerId: UUID,
    offer: RTCSessionDescriptionInit,
  ): Promise<Result<void>> {
    if (this._pendingPeers.has(peerId) || this._connectedPeers.has(peerId)) {
      return result.err("Unable to accept offer on a pre-existing connection");
    }
    const connection = new RTCPeerConnection({ iceServers: this._iceServers });
    const peerState: PeerState = {
      connection,
      data: option.none(),
    };
    this._pendingPeers.set(peerId, peerState);
    connection.ondatachannel = ({ channel }) => {
      peerState.data = option.some(channel);
      this.onConnectionStateChanged(peerId)();
      connection.ondatachannel = null;
    };

    connection.onicecandidate = ({ candidate }) => {
      const candidateOpt = option.unknown(candidate);
      if (candidateOpt.isSome()) {
        this._signalingInterface.sendIceCandidate(peerId, candidateOpt.value);
      }
    };

    connection.onconnectionstatechange = this.onConnectionStateChanged(peerId);

    this._signalingInterface.on(
      "iceCandidate",
      this.onIceCandidate(peerId, connection),
    );

    await connection.setRemoteDescription(offer);

    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    this._signalingInterface.sendAnswer(peerId, answer);

    return result.ok(undefined);
  }

  /**
   * Requests to create a P2P connection to a specified peer. If successful, a
   * `connected` event will be fired. If failed, a `connectionFailed` event will
   * be fired instead.
   */
  public async connectToPeer(peerId: UUID): Promise<Result<void>> {
    if (this._pendingPeers.has(peerId)) {
      return result.err("Peer already has or is pending a connection");
    }
    const connection = new RTCPeerConnection({ iceServers: this._iceServers });
    const dataChannel = connection.createDataChannel(peerId);
    this._pendingPeers.set(peerId, {
      connection,
      data: option.some(dataChannel),
    });
    this._signalingInterface.on("answer", this.onAnswer(peerId, connection));
    this._signalingInterface.on(
      "iceCandidate",
      this.onIceCandidate(peerId, connection),
    );
    connection.onconnectionstatechange = this.onConnectionStateChanged(peerId);

    const offer = await connection.createOffer({
      iceRestart: true,
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await connection.setLocalDescription(offer);

    this._signalingInterface.sendOffer(peerId, offer);

    return result.ok(undefined);
  }

  public async close() {
    for (const [, { connection: conn }] of this._pendingPeers) {
      const closeConn = new Promise<void>((res) => {
        conn.onconnectionstatechange = () => {
          if (conn.connectionState === "closed") {
            res();
          }
        };
      });

      conn.close();
      await closeConn;
    }

    for (const [, conn] of this._connectedPeers) {
      await conn.close();
    }
  }
}
