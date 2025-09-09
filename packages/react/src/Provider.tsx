import {
  P2PConnection,
  PeerId,
  RTC,
  RtcOptions,
  VoidMethods,
} from "@rtcio/core";
import { createContext, ReactNode, useEffect, useRef, useState } from "react";
import { Option, option } from "@dbidwell94/ts-utils";

export interface P2PContext<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
> {
  rtc: Option<{ rtc: RTC<TEvents>; myId: PeerId }>;
  peerIds: PeerId[];
}

export interface P2PProps extends RtcOptions {
  children?: ReactNode;
}

const p2pContext = createContext<P2PContext>(null as never);

export default function P2PProvider<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>({
  roomName,
  signaler,
  children,
  dataTimeoutMs,
  iceServers,
  maxChunkSizeBytes,
}: P2PProps) {
  const peers = useRef(new Map<PeerId, P2PConnection<TEvents>>());

  const [peerIds, setPeerIds] = useState<PeerId[]>([]);

  const [rtc, setRtc] = useState<Option<{ rtc: RTC<TEvents>; myId: PeerId }>>(
    option.none(),
  );

  useEffect(() => {
    const rtcInstance = new RTC<TEvents>({
      roomName,
      signaler,
      dataTimeoutMs,
      iceServers,
      maxChunkSizeBytes,
    });

    rtcInstance.connectToRoom().then((res) => {
      if (res.isError()) {
        return;
      }

      rtcInstance.on("connected", (peer) => {
        peers.current.set(peer.id, peer);
        setPeerIds((current) => [...current, peer.id]);

        peer.on("connectionClosed", (peerId) => {
          setPeerIds((current) => current.filter((id) => id !== peerId));
          peers.current.delete(peerId);
        });
      });

      setRtc(option.some({ rtc: rtcInstance, myId: res.value }));
    });

    return () => {
      rtc.inspect(async ({ rtc: instance }) => {
        await instance.close();
      });
    };
  }, [roomName, signaler, dataTimeoutMs, iceServers, maxChunkSizeBytes]);

  return (
    <p2pContext.Provider value={{ rtc, peerIds }}>
      {children}
    </p2pContext.Provider>
  );
}
