export interface ISignalServer {
  sendLocalDescription: (description: RTCSessionDescription) => Promise<void>;
}