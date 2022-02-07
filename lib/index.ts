import { UserDefinedTypeMap } from './Listener';
import { P2PConnection } from './P2PConnection';

export { rtc } from './Listener';
export {
  IRtcSocketIoClient,
  default as createSignalServerConnection,
  IClientToServerEvents,
  IServerToClientEvents,
} from './SignalServer';

export type IP2PConnection<T extends UserDefinedTypeMap> = P2PConnection<T>;
