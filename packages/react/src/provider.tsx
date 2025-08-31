import { P2PConnection, RTC } from "@rtcio/core";
import { ClientSignaler, PeerId } from "@rtcio/signaling";
import React, {
  createContext,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { option, Option } from "@dbidwell94/ts-utils";

export interface P2PContext<TEvents> {
  rtc: Option<RTC<TEvents>>;
  rtcUpdatedCount: number;
  peers: {
    [peerId: PeerId]: P2PConnection<TEvents>;
  };
  localId: Option<PeerId>;
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

  const peers = useRef<P2PContext<TEvents>["peers"]>({});
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
        peers.current[newPeer.id] = newPeer;
        setPeersUpdatedCount((count) => count + 1);

        newPeer.on("connectionClosed", (peerId) => {});
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
        peers.current = {};

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
