import { P2PConnection, PeerId, VoidMethods } from "@rtcio/core";
import { usePeerContext } from "./usePeerContext";
import { useMemo } from "react";

export function createUsePeers<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return function usePeers<TEvents>() {
    const { peers, peerIds } = usePeerContext<TEvents>();

    return useMemo(() => {
      return Array.from(peers.current.entries()).reduce(
        (acc, [peerId, connection]) => {
          Object.assign(acc, { [peerId]: connection });
          return acc;
        },
        {} as Record<PeerId, P2PConnection<TEvents>>,
      );
    }, [peerIds]);
  };
}
