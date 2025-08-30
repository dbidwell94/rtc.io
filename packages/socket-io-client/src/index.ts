import { SignalerEvents, PeerId, type ClientSignaler } from "@rtcio/signaling";
import { io, type Socket } from "socket.io-client";
import {
  type Option,
  option,
  result,
  Result,
  Some,
} from "@dbidwell94/ts-utils";

export interface SocketIoClientToServerEvent {
  connectToRoom: (roomName: string) => void;
  offer: (toPeer: PeerId, offer: RTCSessionDescriptionInit) => void;
  answer: (toPeer: PeerId, answer: RTCSessionDescriptionInit) => void;
  iceCandidate: (toPeer: PeerId, candidate: RTCIceCandidateInit) => void;
  rejectOffer: (toPeer: PeerId) => void;
}

export interface SocketIoServerToClientEvent extends SignalerEvents {
  newPeerConnected: (clientId: PeerId) => void;
  peerLeft: (clientId: PeerId) => void;
}

export default class SocketIoSignaler implements ClientSignaler {
  private _id: Option<PeerId>;
  private _socket: Socket<
    SocketIoServerToClientEvent,
    SocketIoClientToServerEvent
  >;
  private _roomClients: Set<PeerId> = new Set();

  // awaiting this promise ensures that the client is connected to the signal server
  private _ensureConnected: Promise<void>;

  constructor(baseUrl: string) {
    this._socket = io(baseUrl);

    this._ensureConnected = new Promise((res, rej) => {
      this._socket.on("connect_error", (err) => {
        rej(err);
      });

      this._socket.on("connect", () => {
        this._id = option.unknown(this._socket.id);
        res();
      });
    });

    this._id = option.none();
    this.setupListeners();
  }

  private setupListeners() {
    this._socket.on("newPeerConnected", (id) => {
      this._roomClients.add(id);
    });

    this._socket.on("peerLeft", (id) => {
      this._roomClients.delete(id);
    });

    this._socket.on("connect_error", (err) => {
      console.error(err);
    });
  }

  getRoomPeers(): Array<PeerId> {
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
    this._socket.emit("offer", toPeer, offer);
  }

  sendAnswer(toPeer: PeerId, answer: RTCSessionDescriptionInit): void {
    this._socket.emit("answer", toPeer, answer);
  }

  sendIceCandidate(toPeer: PeerId, candidate: RTCIceCandidateInit): void {
    this._socket.emit("iceCandidate", toPeer, candidate);
  }

  rejectOffer(toPeer: PeerId): void {
    this._socket.emit("rejectOffer", toPeer);
  }

  on<E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ): void {
    this._socket.on(
      event,
      listener as Parameters<typeof this._socket.on<E>>[1],
    );
  }

  off<E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ): void {
    this._socket.off(
      event,
      listener as Parameters<typeof this._socket.on<E>>[1],
    );
  }

  async connectToRoom(roomName: string): Promise<Result<PeerId>> {
    const connectedRes = await result.fromPromise(this._ensureConnected);
    if (connectedRes.isError()) {
      return result.err(connectedRes.error);
    }

    this._socket.emit("connectToRoom", roomName);

    return this._id.okOr(
      "We have connected to the signal server, but we don't have an id. This is a bug and should be reported.",
    );
  }

  async close(): Promise<void> {
    this._socket.close();
  }
}
