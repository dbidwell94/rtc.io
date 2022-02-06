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
   * Returns a tuple where [0] is the RTCDescription and [1] is the client id
   */
  getRemoteOffer: () => Promise<[config: RTCSessionDescription, clientId: string]>;
  /**
   *
   */
  onRemoteAnswer: (callback: (answer: RTCSessionDescription) => Promise<void>) => void;
}
