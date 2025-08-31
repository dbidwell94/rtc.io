import { type P2PConnectionEventMap, type PeerId } from "@rtcio/core";
import { useContext, useEffect, useRef } from "react";
import { type P2PContext, p2pContext } from "../provider";

export default function useSetPeerListener<
  TEvents,
  TKey extends keyof P2PConnectionEventMap<TEvents>,
>(event: TKey, callback: P2PConnectionEventMap<TEvents>[TKey]) {
  const currentCallback = useRef(callback);
  const subscribedPeers = useRef(new Set<PeerId>());

  const { peers } = useContext<P2PContext<TEvents>>(p2pContext);

  useEffect(() => {
    // this will make sure that the cleanup function will have the current iteration of the callback
    // so it can check if the function pointers are the same as `callback`
    currentCallback.current = callback;

    for (const [remotePeerId, connection] of Object.entries(peers)) {
      if (!subscribedPeers.current.has(remotePeerId)) {
        connection.on(event, callback);
        subscribedPeers.current.add(remotePeerId);
      }
    }

    return () => {
      // if the callback has not changed, don't unsubscribe from the callback. If a peer has been removed,
      // we don't have to worry about cleaning up the listeners. The peer is just gone.
      if (currentCallback.current === callback) {
        return;
      }

      for (const [, connection] of Object.entries(peers)) {
        connection.off(event, callback);
      }
    };
  }, [peers, callback]);
}
