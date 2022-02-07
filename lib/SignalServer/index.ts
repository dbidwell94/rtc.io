import { Socket, io, ManagerOptions, SocketOptions } from 'socket.io-client';

export interface IServerToClientEvents {
  /**
   * Called when the SignalServer has successfully connected you to a new channel
   * @param {string[]} peers a list of socket.io id's that are currently connected to the room
   * @param {string} channelName the current channel this event is associated with
   */
  connectedToChannel: (channelName: string, peers: string[]) => void;

  /**
   * Called when the remote signal server has removed you from a channel
   * @param {string} channelName The channel the server has removed you from
   */
  removedFromChannel: (channelName: string) => void;
  /**
   * Called when you have received an offer to connect from a remote client
   * @param {string} fromPeer The socket.io ID of the remote peer
   * @param {RTCSessionDescription} offer The remote RTC description of the offer
   */
  offerReceived: (fromPeer: string, room: string, offer: RTCSessionDescription) => void;

  answerReceived: (fromPeer: string, answer: RTCSessionDescription, room: string) => void;
}

export interface IClientToServerEvents {
  /**
   * Join a new channel in the signalServer
   * @param {string} channelName The channel you wish to connect to
   */
  requestToJoinChannel: (channelName: string) => void;

  /**
   * Remove socket from a channel
   * @param {string} channelName The channel you wish to leave
   */
  requestToLeaveChannel: (channelName: string) => void;

  /**
   * Called when a socket is sending an offer to another remote peer
   * @param {string} toPeer The socket.io ID of remote peer this message is intended for
   * @param {RTCSessionDescription} offer The RTC offer
   */
  rtcOffer: (toPeer: string, offer: RTCSessionDescription, room: string) => void;

  rtcAnswer: (toPeer: string, answer: RTCSessionDescription, room: string) => void;
}

export type IRtcSocketIoClient = Socket<IServerToClientEvents, IClientToServerEvents>;

/**
 * Creates a new socket.io connection for signaling. Best if passed directly into the rtc function
 * @param serverUrl The url for your SignalServer
 * @param options socket.io-client options used to connect to your SignalServer
 * @returns {IRtcSocketIoClient} An instance of socket.io-client which can be used for signaling
 */
export default function createSignalServerConnection(
  serverUrl: string,
  options?: Partial<ManagerOptions & SocketOptions>
): IRtcSocketIoClient {
  return io(serverUrl, options);
}
