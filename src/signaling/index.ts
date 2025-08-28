export type UUID = ReturnType<typeof crypto.randomUUID>;

export interface SignalerEvents {
  offer: (senderId: UUID, offer: RTCSessionDescriptionInit) => void;
  answer: (senderId: UUID, answer: RTCSessionDescriptionInit) => void;
  iceCandidate: (senderId: UUID, candidate: RTCIceCandidateInit) => void;
  connectionRejected: (senderId: UUID) => void;
}

export interface ClientSignaler {
  connectToRoom: (roomName: string) => Promise<UUID>;
  sendOffer: (toPeer: UUID, offer: RTCSessionDescriptionInit) => void;
  sendAnswer: (toPeer: UUID, answer: RTCSessionDescriptionInit) => void;
  sendIceCandidate: (toPeer: UUID, candidate: RTCIceCandidateInit) => void;
  rejectOffer: (from: UUID) => void;
  getRoomPeers: () => Array<UUID>;

  on: <E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ) => void;
  off: <E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ) => void;

  close: () => void;
}
