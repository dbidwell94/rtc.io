export interface IP2PEventMap {
  connected: () => void;
  disconnected: (reason?: string) => void;
  message: (message: string) => void;
}

export interface INotConnected {
  isConnected: false;
  conn: RTCPeerConnection;
}

export interface IConnected {
  isConnected: true;
  conn: RTCPeerConnection;
  data: RTCDataChannel;

  /**
   * This property is to be synced with the remote connection
   */
  id: string;
}

export interface IP2PConfig {
  rtcConfig?: RTCConfiguration;
}
