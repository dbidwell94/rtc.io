import { P2PConnection, type VoidMethods } from "./p2pConnection";
import { type ClientSignaler, type PeerId } from "@rtcio/signaling";
import { type Option, option, type Result, result } from "@dbidwell94/ts-utils";
import Logger from "@rtcio/logger";

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
  // This represents data that should be cleaned up
  // after connection has been closed
  globalStateCleanupAbort: AbortController;
  // This represents data that should be cleaned up
  // after we send control to the P2PConnection
  tempStateCleanupAbort: AbortController;
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

  #logger: Logger;

  private _dataTimeoutMs: Option<number>;
  private _maxChunkSizeBytes: Option<number>;

  private _lifecycleCleanupAbortController = new AbortController();

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

    this.#logger = new Logger(
      "rtcio:core",
      RTC.name,
      crypto.randomUUID().slice(0, 8),
    );

    this.setupListeners();
  }

  private setupListeners() {
    this._signalingInterface.on(
      "offer",
      (sender, offer) => {
        this.#logger.verbose(
          "Offer received from peer {%s}: %o",
          sender.substring(0, 8),
          offer,
        );
        this._events["connectionRequest"]?.forEach((offerCallback) => {
          offerCallback({
            remoteId: sender,
            accept: () => {
              this.#logger.verbose(
                "Accepted offer from peer {%s}",
                sender.substring(0, 8),
              );
              return this.acceptOffer(sender, offer);
            },
            reject: () => {},
          });
        });
      },
      this._lifecycleCleanupAbortController.signal,
    );
  }

  /**
   * Registers an event handler for internal events.
   *
   * @param event - the specific event you want to register a handler for
   * @param handler - The callback which will be fired when a specified event has come in
   * @param abortSignal - If provided and aborted, this will rmeove the specified handler
   *                      from the internal event map
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
    abortSignal?: AbortSignal,
  ) {
    this.#logger.log("Subscribed to event: {%s}", event);
    if (abortSignal) {
      const cleanup = () => {
        this._events[event]?.delete(handler);
        abortSignal.removeEventListener("abort", cleanup);
        this.#logger.log("Cancelled event {%s} via an AbortSignal", event);
      };

      abortSignal.addEventListener("abort", cleanup);
    }

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
    if (!this._events[event]?.has(handler)) {
      this.#logger.warn(
        "Attempted to deregister callback for event {%s} but no callback was found to remove. " +
          "This may indicate a memory leak and should be looked into",
        event,
      );
      return;
    } else {
      this._events[event]?.delete(handler);
      this.#logger.log(
        "Successfully deregistered callback for event: {%s}",
        event,
      );
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
    this.#logger.verbose("Attempting to connect to room: {%s}", this._roomName);
    const myPeerIdRes = await this._signalingInterface.connectToRoom(
      this._roomName,
    );

    if (myPeerIdRes.isError()) {
      this.#logger.error("Failed to connect to room: {%s}", this._roomName);
      return myPeerIdRes;
    }

    this._roomPeerId = option.some(myPeerIdRes.value);
    this.#logger.log("Successfully connected to room: {%s}", this._roomName);
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
    this.#logger.verbose("Gathering room peers from the signal server");
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

      this.#logger.log(
        "Setting remote description on peer: {%s}",
        peerId.substring(0, 8),
      );
      await connection.setRemoteDescription(answer);
    };
  }

  private onIceCandidate(peerId: PeerId, connection: RTCPeerConnection) {
    return async (sender: PeerId, ice: RTCIceCandidateInit) => {
      if (sender !== peerId) return;

      this.#logger.log(
        "Setting ice candidate on peer: {%s}",
        peerId.substring(0, 8),
      );
      await connection.addIceCandidate(ice);
    };
  }

  private onConnectionStateChanged(peerId: PeerId) {
    const peerStateOpt = option.unknown(this._pendingPeers.get(peerId));

    if (peerStateOpt.isNone()) {
      this.#logger.verbose(
        "Attempted to set connection state changed handler for peer: {%s} " +
          "however the peerState could not be found",
        peerId.substring(0, 8),
      );
      return () => {};
    }

    const {
      connection,
      data,
      binaryData,
      globalStateCleanupAbort,
      tempStateCleanupAbort,
    } = peerStateOpt.value;

    /**
     * Relenquish constrol of the RTCPeerConnection and the RTCDataChannels to the
     * P2PConnection class. We should also cleanup any listeners we have assigned here
     * EXCEPT for the iceCandidate event. This should remain so we can continue to
     * trickle the ice candiates to the remote peer
     */
    const sendOff = (
      dataChannel: RTCDataChannel,
      binaryDataChannel: RTCDataChannel,
    ) => {
      // If we already have a connection to this peer, then we should
      // not do anything
      if (this._connectedPeers.has(peerId)) {
        return;
      }

      this.#logger.verbose(
        "Removed onopen event listeners for RTCDataChannels for peer: {%s}",
        peerId.substring(0, 8),
      );
      dataChannel.onopen = null;
      binaryDataChannel.onopen = null;

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
          this.#logger.verbose(
            "P2PConnection has called RTC onClose callback. Cleanup of peer {%s} has begun.",
            peerId.substring(0, 8),
          );
          this._connectedPeers.delete(peerId);
          // Failsafe just to make sure we cleanup any and all data from the P2PConnection
          this._pendingPeers.delete(peerId);
          // Removes any event listeners assigned to this abort signal
          globalStateCleanupAbort.abort();
        },
      });

      // We're handing off control to the P2PConnection. Cleanup any temp listeners
      tempStateCleanupAbort.abort();
      this._pendingPeers.delete(peerId);
      this._connectedPeers.set(peerId, clientConnection);

      let callAmount = 0;
      this._events["connected"]?.forEach((callback) => {
        this.#logger.verbose(
          "Calling connected event callback for peer {%s} -- %s time(s)",
          peerId.substring(0, 8),
          ++callAmount,
        );
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
            this.#logger.verbose(
              "RTCPeerConnection has been connected, but still waiting for RTCDataChannels for peer {%s}",
              peerId.substring(0, 8),
            );
            const connectData = [data.value, binaryData.value]
              .filter((channel) => channel.readyState !== "open")
              .map((channel) => {
                return new Promise<void>((res) => {
                  channel.onopen = () => {
                    // cleaning up the onopen event listener
                    this.#logger.log(
                      "RTCDataChannel has been opened for peer: {%s}",
                      peerId.substring(0, 8),
                    );
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
          this.#logger.error(
            "RTCPeerConnection has failed to connect for peer {%s}",
            peerId.substring(0, 8),
          );

          let failedCallbackAmount = 0;
          this._events["connectionFailed"]?.forEach((callback) => {
            this.#logger.verbose(
              "Calling {connectionFailed} event callback for peer: {%s} -- %s time(s)",
              peerId.substring(0, 8),
              ++failedCallbackAmount,
            );
            callback(peerId);
          });
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
      this.#logger.error(
        "Unable to accept offer on a pre-existing connection for peer: {%s}",
        peerId.substring(0, 8),
      );
      return result.err("Unable to accept offer on a pre-existing connection");
    }
    const connection = new RTCPeerConnection({ iceServers: this._iceServers });
    const peerState: PeerState = {
      connection,
      data: option.none(),
      binaryData: option.none(),
      globalStateCleanupAbort: new AbortController(),
      tempStateCleanupAbort: new AbortController(),
    };
    this._pendingPeers.set(peerId, peerState);
    connection.ondatachannel = ({ channel }) => {
      this.#logger.verbose(
        "New data channel received for peer: {%s}",
        peerId.substring(0, 8),
      );
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
        this.#logger.verbose(
          "Received all required RTCDataChannels. Cleaning up event listeners for peer: {%s}",
          peerId.substring(0, 8),
        );
        this.onConnectionStateChanged(peerId)();
        // Cleaning up the ondatachannel listener as long as we have both channels
        connection.ondatachannel = null;
      }
    };

    connection.addEventListener(
      "icecandidate",
      ({ candidate }) => {
        const candidateOpt = option.unknown(candidate);
        if (candidateOpt.isSome()) {
          this.#logger.log(
            "New RTCIceCandidate found for peer: {%s}",
            peerId.substring(0, 8),
          );
          this._signalingInterface.sendIceCandidate(
            peerId,
            // this is a hack to send a class over the wire.
            // Might just need this for the LocalSignaler, but
            // doing this just to be safe.
            JSON.parse(JSON.stringify(candidateOpt.value)),
          );
        }
      },
      {
        signal: peerState.globalStateCleanupAbort.signal,
      },
    );

    this._signalingInterface.on(
      "iceCandidate",
      this.onIceCandidate(peerId, connection),
      peerState.globalStateCleanupAbort.signal,
    );

    connection.onconnectionstatechange = this.onConnectionStateChanged(peerId);

    this.#logger.log(
      "Setting remote description for peer: {%s}",
      peerId.substring(0, 8),
    );
    await connection.setRemoteDescription(offer);

    const answer = await connection.createAnswer();
    this.#logger.log(
      "Setting local description for peer: {%s}",
      peerId.substring(0, 8),
    );
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
    if (this._pendingPeers.has(peerId) || this._connectedPeers.has(peerId)) {
      this.#logger.error(
        "Unable to connect with pending or already established connection for peer: {%s}",
        peerId.substring(0, 8),
      );
      return result.err("Peer already has or is pending a connection");
    }
    const connection = new RTCPeerConnection({ iceServers: this._iceServers });
    const dataChannel = connection.createDataChannel(DATA_CHANNEL_GENERIC);
    const binaryChannel = connection.createDataChannel(DATA_CHANNEL_BINARY);
    const tempStateCleanupAbort = new AbortController();
    const globalStateCleanupAbort = new AbortController();

    this._pendingPeers.set(peerId, {
      connection,
      data: option.some(dataChannel),
      binaryData: option.some(binaryChannel),
      globalStateCleanupAbort,
      tempStateCleanupAbort,
    });

    this._signalingInterface.on(
      "answer",
      this.onAnswer(peerId, connection),
      // cleanup should be done after we establish connection.
      tempStateCleanupAbort.signal,
    );

    this._signalingInterface.on(
      "iceCandidate",
      this.onIceCandidate(peerId, connection),
      // cleanup should be done when the connection closes.
      globalStateCleanupAbort.signal,
    );

    connection.addEventListener(
      "icecandidate",
      ({ candidate }) => {
        const candidateOpt = option.unknown(candidate);

        if (candidateOpt.isNone()) {
          return;
        }

        this.#logger.log(
          "RTCIceCandidate found for peer: {%s}",
          peerId.substring(0, 8),
        );

        this._signalingInterface.sendIceCandidate(
          peerId,
          // Same hack as above. Just to be safe.
          JSON.parse(JSON.stringify(candidateOpt.value)),
        );
      },
      {
        signal: globalStateCleanupAbort.signal,
      },
    );

    connection.onconnectionstatechange = this.onConnectionStateChanged(peerId);

    const offer = await connection.createOffer({
      iceRestart: true,
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    this.#logger.log(
      "Setting local description for peer: {%s}",
      peerId.substring(0, 8),
    );
    await connection.setLocalDescription(offer);

    this._signalingInterface.sendOffer(peerId, offer);

    return result.ok(undefined);
  }

  /**
   * Closes all open and pending connections, as well as
   * the connection to the signal server if applicable.
   */
  public async close() {
    this.#logger.log("Close handler has been called. Cleanup has started");
    // abort any in-progress event listeners for the global lifecycle
    this._lifecycleCleanupAbortController.abort();

    for (const [
      peer,
      { connection: conn, globalStateCleanupAbort, tempStateCleanupAbort },
    ] of this._pendingPeers) {
      // abort any scoped event listeners
      globalStateCleanupAbort.abort();
      tempStateCleanupAbort.abort();

      const closeConn = new Promise<void>((res) => {
        if (conn.connectionState === "closed") {
          this.#logger.log(
            "RTCPeerConnection has already been closed on peer: {%s}",
            peer.substring(0, 8),
          );
          res();
        }
        conn.onconnectionstatechange = () => {
          if (conn.connectionState === "closed") {
            this.#logger.log(
              "RTCPeerConnection has been closed on pending peer: {%s}",
              peer.substring(0, 8),
            );
            conn.onconnectionstatechange = null;
            res();
          }
        };
      });

      conn.close();
      await closeConn;
    }

    for (const [peerId, conn] of this._connectedPeers) {
      this.#logger.log("Force closing peer: {%s}", peerId.substring(0, 8));
      await conn.close();
    }

    await this._signalingInterface.close();
    this.#logger.log("ClientSignaler has been closed");
  }
}
