import { SignalerEvents, PeerId, type ClientSignaler } from "@rtcio/signaling";
import { io, type Socket } from "socket.io-client";
import {
  type Option,
  option,
  result,
  Result,
  Some,
} from "@dbidwell94/ts-utils";
import Logger from "@rtcio/logger";

export interface SocketIoClientToServerEvent {
  connectToRoom: (roomName: string) => void;
  offer: (toPeer: PeerId, offer: RTCSessionDescriptionInit) => void;
  answer: (toPeer: PeerId, answer: RTCSessionDescriptionInit) => void;
  iceCandidate: (toPeer: PeerId, candidate: RTCIceCandidateInit) => void;
  rejectOffer: (toPeer: PeerId) => void;
  requestPeers: () => PeerId[];
}

export interface SocketIoServerToClientEvent extends SignalerEvents {
  newPeerConnected: (clientId: PeerId) => void;
  peerLeft: (clientId: PeerId) => void;
  roomPeers: (peers: PeerId[]) => void;
}

export default class SocketIoSignaler implements ClientSignaler {
  private _id: Option<PeerId>;
  private _socket: Socket<
    SocketIoServerToClientEvent,
    SocketIoClientToServerEvent
  >;
  private _roomClients: Set<PeerId> = new Set();

  #logger: Logger;

  // awaiting this promise ensures that the client is connected to the signal server
  private _ensureConnected: Promise<void>;

  constructor(...params: Parameters<typeof io>) {
    this._socket = io(...params);

    this._ensureConnected = new Promise((res, rej) => {
      this._socket.on("connect_error", (err) => {
        rej(err);
      });

      this._socket.on("connect", () => {
        this._id = option.unknown(this._socket.id);
        res();
      });
    });

    this.#logger = new Logger(
      "rtcio:socket-io-client",
      SocketIoSignaler.name,
      crypto.randomUUID().substring(0, 8),
    );

    this._id = option.none();
    this.setupListeners();
  }

  private setupListeners() {
    this.#logger.log("Socket.IO signaler created. Subscribing to events.");
    this._socket.on("newPeerConnected", (id) => {
      this.#logger.verbose(
        "New peer connected. peerId: %s",
        id.substring(0, 8),
      );
      this._roomClients.add(id);
    });

    this._socket.on("peerLeft", (id) => {
      this.#logger.verbose("Peer left room. peerId: %s", id.substring(0, 8));
      this._roomClients.delete(id);
    });

    this._socket.on("connect_error", (err) => {
      this.#logger.error("Connection error: %o", err);
    });

    this._socket.on("roomPeers", (peers) => {
      this._roomClients = new Set(peers);
    });
  }

  getRoomPeers(): Array<PeerId> {
    this.#logger.verbose("getRoomPeers");
    if (this._id.isNone()) {
      return [...this._roomClients];
    }
    // Makes sure we don't send our own ID as a signal server connected peer. Prevents us from
    // trying to connect to ourselves.
    return [...this._roomClients].filter((id) => {
      return id !== (this._id as Some<PeerId>).value;
    });
  }

  sendOffer(toPeer: PeerId, offer: RTCSessionDescriptionInit): void {
    this.#logger.verbose(
      "Sending offer to peer: %s -- %o",
      toPeer.substring(0, 8),
      offer,
    );
    this._socket.emit("offer", toPeer, offer);
  }

  sendAnswer(toPeer: PeerId, answer: RTCSessionDescriptionInit): void {
    this.#logger.verbose(
      "Sending answer to peer: %s -- %o",
      toPeer.substring(0, 8),
      answer,
    );
    this._socket.emit("answer", toPeer, answer);
  }

  sendIceCandidate(toPeer: PeerId, candidate: RTCIceCandidateInit): void {
    this.#logger.verbose(
      "Sending ice candidate to peer: %s -- %o",
      toPeer.substring(0, 8),
      candidate,
    );
    this._socket.emit("iceCandidate", toPeer, candidate);
  }

  rejectOffer(toPeer: PeerId): void {
    this.#logger.verbose(
      "Sending offer rejection to peer: %s",
      toPeer.substring(0, 8),
    );
    this._socket.emit("rejectOffer", toPeer);
  }

  on<E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ): void {
    this.#logger.log("Registering event listener for event: %s", event);
    this._socket.on(
      event,
      listener as Parameters<typeof this._socket.on<E>>[1],
    );
  }

  off<E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ): void {
    this.#logger.log("Removing event listener for event: %s", event);
    this._socket.off(
      event,
      listener as Parameters<typeof this._socket.on<E>>[1],
    );
  }

  async connectToRoom(roomName: string): Promise<Result<PeerId>> {
    this.#logger.log("Connecting to room: %s", roomName);
    const connectedRes = await result.fromPromise(this._ensureConnected);
    if (connectedRes.isError()) {
      this.#logger.error(
        "Failed to connect to room: %s -- %o",
        roomName,
        connectedRes.error,
      );
      return result.err(connectedRes.error);
    }

    this._socket.emit("connectToRoom", roomName);
    this._socket.emit("requestPeers");

    return this._id.okOr(
      "We have connected to the signal server, but we don't have an id. This is a bug and should be reported.",
    );
  }

  async close(): Promise<void> {
    this.#logger.log("Closing signaler...");
    this._socket.close();
  }
}
