export type UUID = ReturnType<typeof crypto.randomUUID>;

export interface SignalerEvents {
  offer: (senderId: UUID, offer: RTCSessionDescriptionInit) => void;
  answer: (senderId: UUID, answer: RTCSessionDescriptionInit) => void;
  iceCandidate: (senderId: UUID, candidate: RTCIceCandidateInit) => void;
  connectionRejected: (senderId: UUID) => void;
}

export interface ClientSignaler {
  /**
   * This is a request to connect to a room. The signal server should
   * return a uuid-v4 to the client upon successful connection.
   */
  connectToRoom: (roomName: string) => Promise<UUID>;
  /**
   * Represents an incoming offer from a peer to a specified `toPeer`.
   * This will contain an SDP offer and should be sent to the specified client.
   * The client will determine if it wants to accept or reject the offer.
   */
  sendOffer: (toPeer: UUID, offer: RTCSessionDescriptionInit) => void;
  /**
   * The peer has accepted the offer, and is replying with an answer. This will
   * contain an SDP answer and should be forwarded to the `toPeer` UUID for
   * them to process to start ICE negotiation.
   */
  sendAnswer: (toPeer: UUID, answer: RTCSessionDescriptionInit) => void;
  /**
   * The peer has found a new ICE candidate and is informing `toPeer` of the new
   * candidate. This should be forwarded to the `toPeer` UUID for them to process.
   */
  sendIceCandidate: (toPeer: UUID, candidate: RTCIceCandidateInit) => void;
  /**
   * The client has rejected the offer sent to them from the `sendOffer` call.
   * This should be forwarded to the original offerer so the `connectionRejected`
   * event can be fired.
   */
  rejectOffer: (from: UUID) => void;
  /**
   * This will return all the UUIDs in the current room. The caller can then use the
   * retrieved id's to determine who to send an offer to.
   */
  getRoomPeers: () => Array<UUID>;

  /**
   * These are specific events that the RTC manager will subscribe to.
   */
  on: <E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ) => void;
  /**
   * If the caller calls this, the handler should be removed and no longer be able to be called.
   */
  off: <E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ) => void;

  /**
   * If implementing `ClientSignaler` on a persistant connection such as WebSocket,
   * the connection should be closed here and properly disposed of. The RTC manager
   * instance no longer has need of signaling.
   */
  close: () => Promise<void>;
}
