import { PeerId, VoidMethods } from "@rtcio/core";
import { usePeerContext } from "./usePeerContext";
import { Result, result } from "@dbidwell94/ts-utils";

export function createUsePeerEmitter<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return function usePeerEmitter() {
    const ctx = usePeerContext<TEvents>();
    if (!ctx) {
      throw new Error(
        "usePeerEmitter must be called from within a P2PProvider",
      );
    }

    async function emitEvent<TKey extends keyof TEvents>(
      toPeer: PeerId,
      eventName: TKey,
      ...args: Parameters<TEvents[TKey]>
    ): Promise<Result<void>> {
      const peer = ctx.peers.current.get(toPeer);
      if (!peer) {
        return result.err(`Peer with id ${toPeer} is not connected`);
      }

      return peer.emit(eventName, ...args);
    }

    return emitEvent;
  };
}
