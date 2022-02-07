export interface ISignalServer {
  /**
   * The id unique to _this_ SignalServer synced with remote server
   */
  id: string;
  /**
   * Connect to a new room. Returns a list of potential peers to connect to (if available)
   */
  connectToRoom: (roomName: string) => Promise<string[]>;
  disconnectFromRoom: (roomName: string) => void;
  sendOffer: (offer: RTCSessionDescription, toClient?: string) => void;
  sendAnswer: (answer: RTCSessionDescription, toClient: string) => void;

  /**
   * Sets a callback to be called when a remote answer is received.
   */
  onRemoteAnswer: (callback: (answer: RTCSessionDescription) => Promise<void>) => void;

  /**
   * Sets a callback to be called when a remote offer is received.
   */
  onRemoteOffer: (callback: (answer: RTCSessionDescription) => Promise<void>) => void;
}
