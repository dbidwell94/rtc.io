import { option } from "@dbidwell94/ts-utils";
import { type PeerId } from "@rtcio/signaling";
import {
  type SocketIoClientToServerEvent,
  type SocketIoServerToClientEvent,
} from "@rtcio/socket-io-client";
import { Server, type Socket } from "socket.io";

export function rtcioServer(...args: ConstructorParameters<typeof Server>) {
  const io = new Server<
    SocketIoClientToServerEvent,
    SocketIoServerToClientEvent
  >(...args);

  const idsToPeers: Map<
    PeerId,
    Socket<SocketIoClientToServerEvent, SocketIoServerToClientEvent>
  > = new Map();

  io.on("connection", (peer) => {
    idsToPeers.set(peer.id, peer);

    peer.on("connectToRoom", (roomName) => {
      peer.join(roomName);
      io.to(roomName).emit("newPeerConnected", peer.id);
    });

    peer.on("disconnect", () => {
      io.to([...peer.rooms]).emit("peerLeft", peer.id);
      idsToPeers.delete(peer.id);
    });

    peer.on("offer", (toPeer, offer) => {
      const otherPeer = option.unknown(idsToPeers.get(toPeer));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("offer", peer.id, offer);
      }
    });

    peer.on("answer", (toPeerId, answer) => {
      const otherPeer = option.unknown(idsToPeers.get(toPeerId));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("answer", peer.id, answer);
      }
    });

    peer.on("iceCandidate", (toPeer, candidate) => {
      const otherPeer = option.unknown(idsToPeers.get(toPeer));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("iceCandidate", peer.id, candidate);
      }
    });

    peer.on("rejectOffer", (toPeer) => {
      const otherPeer = option.unknown(idsToPeers.get(toPeer));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("connectionRejected", peer.id);
      }
    });
  });

  return io;
}
