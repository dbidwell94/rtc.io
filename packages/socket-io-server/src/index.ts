import { option } from "@dbidwell94/ts-utils";
import { type PeerId } from "@rtcio/signaling";
import {
  type SocketIoClientToServerEvent,
  type SocketIoServerToClientEvent,
} from "@rtcio/socket-io-client";
import { Server, type Socket } from "socket.io";
import Logger from "@rtcio/logger";

export function rtcioServer(...args: ConstructorParameters<typeof Server>) {
  const io = new Server<
    SocketIoClientToServerEvent,
    SocketIoServerToClientEvent
  >(...args);

  const logger = new Logger("rtcio:socket-io-server");

  const idsToPeers: Map<
    PeerId,
    Socket<SocketIoClientToServerEvent, SocketIoServerToClientEvent>
  > = new Map();

  io.on("connection", (peer) => {
    logger.log("New connection: %s", peer.id.substring(0, 8));
    idsToPeers.set(peer.id, peer);

    peer.on("connectToRoom", (roomName) => {
      logger.log(
        "Peer %s connected to room %s",
        peer.id.substring(0, 8),
        roomName,
      );
      peer.join(roomName);
      io.to(roomName).emit("newPeerConnected", peer.id);
    });

    peer.on("disconnect", () => {
      logger.log("Peer %s has disconnected", peer.id.substring(0, 8));
      io.to([...peer.rooms]).emit("peerLeft", peer.id);
      idsToPeers.delete(peer.id);
    });

    peer.on("offer", (toPeer, offer) => {
      logger.log(
        "Peer %s sent offer to peer %s",
        peer.id.substring(0, 8),
        toPeer.substring(0, 8),
      );
      const otherPeer = option.unknown(idsToPeers.get(toPeer));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("offer", peer.id, offer);
      } else {
        logger.warn("Peer %s not available", toPeer.substring(0, 8));
      }
    });

    peer.on("answer", (toPeerId, answer) => {
      logger.log(
        "Peer %s sent answer to peer %s",
        peer.id.substring(0, 8),
        toPeerId.substring(0, 8),
      );
      const otherPeer = option.unknown(idsToPeers.get(toPeerId));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("answer", peer.id, answer);
      } else {
        logger.warn("Peer %s is not available", toPeerId.substring(0, 8));
      }
    });

    peer.on("iceCandidate", (toPeer, candidate) => {
      logger.log(
        "Peer %s sent ice candidate to peer %s",
        peer.id.substring(0, 8),
        toPeer.substring(0, 8),
      );
      const otherPeer = option.unknown(idsToPeers.get(toPeer));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("iceCandidate", peer.id, candidate);
      } else {
        logger.warn("Peer %s is not available", toPeer.substring(0, 8));
      }
    });

    peer.on("rejectOffer", (toPeer) => {
      logger.log(
        "Peer %s has rejected the offer from peer %s",
        peer.id.substring(0, 8),
        toPeer.substring(0, 8),
      );
      const otherPeer = option.unknown(idsToPeers.get(toPeer));

      if (otherPeer.isSome()) {
        otherPeer.value.emit("connectionRejected", peer.id);
      } else {
        logger.warn("Peer %s is not available", toPeer.substring(0, 8));
      }
    });
  });

  return io;
}
