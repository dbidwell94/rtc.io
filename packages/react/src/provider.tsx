import { P2PConnection, RTC, VoidMethods } from "@rtcio/core";
import { ClientSignaler, PeerId } from "@rtcio/signaling";
import {
  createContext,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { option, Option } from "@dbidwell94/ts-utils";

/**
 * Represents the current connection to the Signal Server
 */
export enum ConnectionStatus {
  /**
   * Represents a closed state. The connection has yet to be attempted.
   */
  Closed,
  /**
   * Represents a connecting state. The connection to the signal server is underway.
   */
  Connecting,
  /**
   * Connection to the signal server has been established.
   */
  Connected,
  /**
   * Failed to connect to the signal server.
   */
  Error,
}

export interface P2PContext<TEvents> {
  rtc: Option<RTC<TEvents>>;
  rtcUpdatedCount: number;
  peers: Map<PeerId, P2PConnection<TEvents>>;
  localId: Option<PeerId>;
}

export interface PublicP2PState<TEvents extends VoidMethods<TEvents>> {
  signalConnectionState: ConnectionStatus;
  rtc: RTC<TEvents>;
  error: Option<Error>;
  peers: Map<PeerId, P2PConnection<TEvents>>;
}

export const p2pContext = createContext<P2PContext<never>>(null as never);

export interface ProviderProps {
  signaler: ClientSignaler;
  children: ReactNode;
  roomName: string;
  iceServers?: RTCIceServer[];
}

export default function Provider<TEvents>({
  children,
  signaler,
  roomName,
  iceServers,
}: ProviderProps) {
  const providerMounted = useRef(true);

  const peers = useRef<P2PContext<TEvents>["peers"]>(new Map());
  const rtc = useRef<P2PContext<TEvents>["rtc"]>(option.none());

  const [localId, setLocalId] = useState<Option<PeerId>>(option.none());
  const [rtcUpdatedCount, setRtcUpdatedCount] = useState(0);
  const [peersUpdatedCount, setPeersUpdatedCount] = useState(0);

  const stateValue = useMemo<P2PContext<TEvents>>(
    () => ({
      peers: peers.current,
      rtc: rtc.current,
      rtcUpdatedCount,
      localId,
    }),
    [rtcUpdatedCount, localId, peersUpdatedCount],
  );

  useEffect(() => {
    providerMounted.current = true;
    const rtcInstance = new RTC<TEvents>(signaler, roomName, iceServers);

    (async () => {
      const myIdRes = await rtcInstance.connectToRoom();
      if (myIdRes.isError()) {
        console.error(myIdRes.error);
        return;
      }

      rtcInstance.on("connected", (newPeer) => {
        peers.current.set(newPeer.id, newPeer);
        setPeersUpdatedCount((count) => count + 1);

        newPeer.on("connectionClosed", (peerId) => {
          peers.current.delete(peerId);
          setPeersUpdatedCount((count) => count + 1);
        });
      });

      if (providerMounted.current) {
        setLocalId(option.some(myIdRes.value));
        rtc.current = option.some(rtcInstance);
        setRtcUpdatedCount((count) => count + 1);
      }
    })();

    return () => {
      providerMounted.current = false;

      (async () => {
        await rtcInstance.close();
        rtc.current = option.none();
        peers.current = new Map();

        if (providerMounted.current) {
          setRtcUpdatedCount((count) => count + 1);
          setPeersUpdatedCount((count) => count + 1);
        }
      })();
    };
  }, []);

  return (
    <p2pContext.Provider value={stateValue}>{children}</p2pContext.Provider>
  );
}
