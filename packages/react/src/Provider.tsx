import {
  P2PConnection,
  PeerId,
  RTC,
  RtcOptions,
  VoidMethods,
} from "@rtcio/core";
import {
  createContext,
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Option, option } from "@dbidwell94/ts-utils";

export interface P2PContext<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
> {
  rtc: Option<{ rtc: RTC<TEvents>; myId: PeerId }>;
  peerIds: PeerId[];
  peers: RefObject<Map<PeerId, P2PConnection<TEvents>>>;
  signalerPeers: PeerId[];
}

export interface P2PProps extends RtcOptions {
  /**
   * If the ClientSignaler doesn't support real time events,
   * then we must poll the signaler to get the current list of
   * peers in the room. If this property is set, then we will
   * poll for signaler peers at the specified interval. Otherwise
   * we will be listening for a peer connected event from the
   * ClientSignaler
   */
  pollSignalerInterval?: number;
  children?: ReactNode;
}

export const p2pContext = createContext<P2PContext>(null as never);

export default function P2PProvider<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>({
  roomName,
  signaler,
  children,
  dataTimeoutMs,
  iceServers,
  maxChunkSizeBytes,
  pollSignalerInterval,
}: P2PProps) {
  const memoSignaler = useMemo(() => signaler, []);
  const memoIce = useMemo(() => iceServers, []);
  const memoDataTimeout = useMemo(() => dataTimeoutMs, []);
  const memoDataSize = useMemo(() => maxChunkSizeBytes, []);

  const peers = useRef(new Map<PeerId, P2PConnection<TEvents>>());
  const signalerPeers = useRef(new Set<PeerId>());

  const [signalPeersUpdated, setSignalPeersUpdated] = useState(false);
  const [peerIds, setPeerIds] = useState<PeerId[]>([]);
  const [rtc, setRtc] = useState<Option<{ rtc: RTC<TEvents>; myId: PeerId }>>(
    option.none(),
  );

  useEffect(() => {
    if (rtc.isNone()) return;

    const { rtc: manager } = rtc.value;

    let interval = option.none<ReturnType<typeof setInterval>>();
    const onPeersHandler = new AbortController();

    if (pollSignalerInterval) {
      interval = option.some(
        setInterval(() => {
          const roomPeers = new Set(manager.getRoomPeers());
          let peersUpdated = false;

          // first, check to see if a new peer joined
          for (const peerId of roomPeers) {
            if (!signalerPeers.current.has(peerId)) {
              signalerPeers.current.add(peerId);
              peersUpdated = true;
            }
          }

          // now check to see if a peer disconnected
          for (const peerId of signalerPeers.current) {
            if (!roomPeers.has(peerId)) {
              peersUpdated = true;
              signalerPeers.current.delete(peerId);
            }
          }

          if (peersUpdated) {
            setSignalPeersUpdated((val) => !val);
          }
        }, pollSignalerInterval),
      );
    } else {
      manager.on(
        "signalPeerConnected",
        (newPeer) => {
          signalerPeers.current.add(newPeer);
          setSignalPeersUpdated((val) => !val);
        },
        onPeersHandler.signal,
      );

      manager.on(
        "signalPeerDisconnected",
        (peerId) => {
          signalerPeers.current.delete(peerId);
          setSignalPeersUpdated((val) => !val);
        },
        onPeersHandler.signal,
      );
    }

    return () => {
      interval.inspect((handle) => clearTimeout(handle));
      onPeersHandler.abort();
    };
  }, [pollSignalerInterval, rtc]);

  useEffect(() => {
    const rtcInstance = new RTC<TEvents>({
      roomName,
      signaler: memoSignaler,
      dataTimeoutMs: memoDataTimeout,
      iceServers: memoIce,
      maxChunkSizeBytes: memoDataSize,
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
      rtcInstance.close();
    };
  }, [roomName]);

  const memoSignalPeers = useMemo(() => {
    return Array.from(signalerPeers.current);
  }, [signalPeersUpdated]);

  return (
    <p2pContext.Provider
      value={{ rtc, peerIds, peers, signalerPeers: memoSignalPeers }}
    >
      {children}
    </p2pContext.Provider>
  );
}
