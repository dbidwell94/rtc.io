import { P2PConnection, type VoidMethods } from "./p2pConnection";
import { type ClientSignaler, type PeerId } from "@rtcio/signaling";
import { type Option, option, type Result, result } from "@dbidwell94/ts-utils";

const DATA_CHANNEL_GENERIC = "generic";
const DATA_CHANNEL_BINARY = "binary";

const freeIceServers = [
  "stun:stun.l.google.com:19302",
  "stun:stun.l.google.com:5349",
  "stun:stun1.l.google.com:3478",
  "stun:stun1.l.google.com:5349",
];

/**
 * Represents an incoming connection request. If accepted, the process to connect
 * to the remote peer will take place.
 */
export interface RemoteOffer {
  /**
   * This is the remote ID of the incoming offer. This will be a uuid-v4
   * and does not represent any state on the remote signaling server. You
   * should have a local cache of a remote id and any other info you need
   * in order to make a choice if you want to accept or reject the connection.
   */
  remoteId: PeerId;
  /**
   * If called, this will start the P2P connection process.
   * If the connection fails, a `connectionFailed` event will
   * be fired on both clients. If successful,
   * a `connected` event will be fired.
   */
  accept: () => Promise<Result<void>>;
  /**
   * If called, this will reject the incoming connection.
   * This will fire the `connectionFailed` event on the
   * requesting client.
   */
  reject: () => void;
}

export interface InternalEvents<
  ClientToPeerEvents extends VoidMethods<ClientToPeerEvents>,
> {
  /**
   * A new peer has connected. Any event listeners specific to the
   * newly connected peer can be set on the `peer` parameter.
   *
   * @param peer - Represents a p2p networked connection to a remote peer
   */
  connected: (peer: P2PConnection<ClientToPeerEvents>) => void;
  /**
   * The request to connect to the remote peer has failed.
   */
  connectionFailed: (peerId: PeerId) => void;
  /**
   * A new connection has been requested by a remote peer.You may
   * inspect the `offer.remoteId` to view the uuid-v4 of the remote peer.
   */
  connectionRequest: (offer: RemoteOffer) => void;
  /**
   * Called if there is an error in the RTC or Signaling process
   */
  error: (error: Error) => void;
}

interface PeerState {
  connection: RTCPeerConnection;
  data: Option<RTCDataChannel>;
  binaryData: Option<RTCDataChannel>;
}

export interface RtcOptions {
  signaler: ClientSignaler;
  roomName: string;
  iceServers?: RTCIceServer[];
  dataTimeoutMs?: number;
  maxChunkSizeBytes?: number;
}

/**
 * The base manager for all peer connections in the rtc.io library. This automatically handles
 * signaling to and from remote peers in order to create a `P2PConnection`
 */
export class RTC<ClientToPeerEvent extends VoidMethods<ClientToPeerEvent>> {
  private _pendingPeers: Map<PeerId, PeerState>;
  private _connectedPeers: Map<PeerId, P2PConnection<ClientToPeerEvent>>;
  private _signalingInterface: ClientSignaler;
  private _roomName: string;
  private _roomPeerId: Option<PeerId>;
  private _iceServers: RTCIceServer[];

  private _dataTimeoutMs: Option<number>;
  private _maxChunkSizeBytes: Option<number>;

  private _events: {
    [K in keyof InternalEvents<ClientToPeerEvent>]?: Set<
      InternalEvents<ClientToPeerEvent>[K]
    >;
  } = Object.create(null);

  /**
   * Constructs a new instance of the RTC manager class. Requires caller to pass in anything
   * that implements the `ClientSignaler` interface, and a roomName to connect to. Optionally,
   * the user can also pass in an array of ICE servers, however if none is provided,
   * the library will use default Google STUN servers.
   *
   * @param signalingInterface - Provides signaling between the manager and another set of peers.
   * @param roomName - Helps to narrow down the list of peers to connect to. It is the job of the
   * signalingInterface to provide a list of candiates in a particular room
   * @param iceServers - An optional list of ICE servers. If not provided, will use default
   * Google STUN servers
   */
  constructor({
    roomName,
    signaler: signalingInterface,
    dataTimeoutMs,
    iceServers = [{ urls: freeIceServers }],
    maxChunkSizeBytes,
  }: RtcOptions) {
    this._iceServers = iceServers;
    this._pendingPeers = new Map();
    this._connectedPeers = new Map();
    this._roomName = roomName;
    this._roomPeerId = option.none();
    this._signalingInterface = signalingInterface;
    this._dataTimeoutMs = option.unknown(dataTimeoutMs);
    this._maxChunkSizeBytes = option.unknown(maxChunkSizeBytes);
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

  /**
   * Registers an event handler for internal events.
   *
   * @example
   *  import {RTC} from 'rtc.io';
   *
   *  const rtcManager = new RTC(..);
   *
   *  rtcManager.on('connectionRequest', async (request) => {
   *    if (request.remoteId === myExpectedId) {
   *      await request.accept();
   *    } else {
   *      await request.reject();
   *    }
   *  })
   */
  public on<TKey extends keyof InternalEvents<ClientToPeerEvent>>(
    event: TKey,
    handler: InternalEvents<ClientToPeerEvent>[TKey],
  ) {
    if (this._events[event]) {
      this._events[event].add(handler);
    } else {
      // TODO! - Fix the typing here so I don't have to do this redundant cast.
      this._events[event] = new Set([
        handler,
      ]) as (typeof this._events)[typeof event];
    }
  }

  /**
   * Removes an event listener for the specified internal event
   */
  public off<TKey extends keyof InternalEvents<ClientToPeerEvent>>(
    event: TKey,
    handler: InternalEvents<ClientToPeerEvent>[TKey],
  ) {
    if (this._events[event]) {
      this._events[event].delete(handler);
    }
  }

  /**
   * Facilitates the connection to the signaling server to the specified room.
   *
   * @example
   * import { RTC } from 'rtc.io';
   *
   * const p2pManager = new RTC(signaler, "myRoom");
   *
   * // This will connect the manager to the signaler in the room
   * // specified in the constructor.
   * await p2pManager.connectToRoom();
   *
   */
  public async connectToRoom(): Promise<Result<PeerId>> {
    const myPeerIdRes = await this._signalingInterface.connectToRoom(
      this._roomName,
    );

    if (myPeerIdRes.isError()) {
      return result.err(myPeerIdRes.error);
    }

    this._roomPeerId = option.some(myPeerIdRes.value);
    return result.ok(myPeerIdRes.value);
  }

  /**
   * Gets a list of the peers from the signaling server in the current room.
   *
   * @example
   * ```ts
   * import { RTC } from 'rtc.io';
   *
   * const p2pManager = new RTC(signaler, 'myRoom');
   *
   * for (const remotePeer of p2pManager.getRoomPeers()) {
   *  // This will send the connection request to the remote peer.
   *  await p2pManager.connectToPeer(remotePeer);
   * }
   * ```
   */
  public getRoomPeers(): Array<PeerId> {
    if (this._roomPeerId.isNone()) {
      return [];
    }
    const myId = this._roomPeerId.value;
    return this._signalingInterface
      .getRoomPeers()
      .filter((peer) => peer !== myId);
  }

  private onAnswer(peerId: PeerId, connection: RTCPeerConnection) {
    return async (sender: PeerId, answer: RTCSessionDescriptionInit) => {
      if (sender !== peerId) return;

      await connection.setRemoteDescription(answer);
    };
  }

  private onIceCandidate(peerId: PeerId, connection: RTCPeerConnection) {
    return async (sender: PeerId, ice: RTCIceCandidateInit) => {
      if (sender !== peerId) return;

      await connection.addIceCandidate(ice);
    };
  }

  private onConnectionStateChanged(peerId: PeerId) {
    const peerStateOpt = option.unknown(this._pendingPeers.get(peerId));

    if (peerStateOpt.isNone()) return () => {};

    const { connection, data, binaryData } = peerStateOpt.value;

    const sendOff = (
      dataChannel: RTCDataChannel,
      binaryDataChannel: RTCDataChannel,
    ) => {
      dataChannel.onopen = null;
      this._events["connected"]?.forEach((callback) => {
        const clientConnection = new P2PConnection<ClientToPeerEvent>({
          binaryDataChannel,
          connection,
          genericDataChannel: dataChannel,
          peerId,
          dataTimeout: this._dataTimeoutMs.unsafeUnwrap() as number | undefined,
          maxChunkSize: this._maxChunkSizeBytes.unsafeUnwrap() as
            | number
            | undefined,
          onClose: () => {
            this._connectedPeers.delete(peerId);

            // Failsafe just to make sure we cleanup any and all data from the P2PConnection
            this._pendingPeers.delete(peerId);
          },
        });

        this._pendingPeers.delete(peerId);
        this._connectedPeers.set(peerId, clientConnection);
        callback(clientConnection);
      });
    };

    return async () => {
      switch (connection.connectionState) {
        case "connected": {
          // Make sure the data channel is also ready before handing off
          if (data.isNone() || binaryData.isNone()) {
            return;
          }

          // If the data channels are not yet open, then we need to wait for them to be
          // available before we send control to the P2PConnection
          if (
            data.value.readyState !== "open" ||
            binaryData.value.readyState !== "open"
          ) {
            const connectData = [data.value, binaryData.value]
              .filter((channel) => channel.readyState !== "open")
              .map((channel) => {
                return new Promise<void>((res) => {
                  channel.onopen = () => {
                    channel.onopen = null;
                    res();
                  };
                });
              });

            await Promise.all(connectData);
          }

          sendOff(data.value, binaryData.value);
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
    peerId: PeerId,
    offer: RTCSessionDescriptionInit,
  ): Promise<Result<void>> {
    if (this._pendingPeers.has(peerId) || this._connectedPeers.has(peerId)) {
      return result.err("Unable to accept offer on a pre-existing connection");
    }
    const connection = new RTCPeerConnection({ iceServers: this._iceServers });
    const peerState: PeerState = {
      connection,
      data: option.none(),
      binaryData: option.none(),
    };
    this._pendingPeers.set(peerId, peerState);
    connection.ondatachannel = ({ channel }) => {
      switch (channel.label) {
        case DATA_CHANNEL_GENERIC: {
          peerState.data = option.some(channel);
          break;
        }
        case DATA_CHANNEL_BINARY: {
          peerState.binaryData = option.some(channel);
        }
      }

      if (peerState.binaryData.isSome() && peerState.data.isSome()) {
        this.onConnectionStateChanged(peerId)();
        connection.ondatachannel = null;
      }
    };

    connection.onicecandidate = ({ candidate }) => {
      const candidateOpt = option.unknown(candidate);
      if (candidateOpt.isSome()) {
        this._signalingInterface.sendIceCandidate(
          peerId,
          JSON.parse(JSON.stringify(candidateOpt.value)),
        );
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
  public async connectToPeer(peerId: PeerId): Promise<Result<void>> {
    if (this._pendingPeers.has(peerId)) {
      return result.err("Peer already has or is pending a connection");
    }
    const connection = new RTCPeerConnection({ iceServers: this._iceServers });
    const dataChannel = connection.createDataChannel(DATA_CHANNEL_GENERIC);
    const binaryChannel = connection.createDataChannel(DATA_CHANNEL_BINARY);

    this._pendingPeers.set(peerId, {
      connection,
      data: option.some(dataChannel),
      binaryData: option.some(binaryChannel),
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

  /**
   * Closes all open and pending connections, as well as
   * the connection to the signal server if applicable.
   */
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

    await this._signalingInterface.close();
  }
}
