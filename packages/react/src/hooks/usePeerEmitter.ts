import { PeerId, VoidMethods } from "@rtcio/core";
import { usePeerContext } from "./usePeerContext";
import { Result, result } from "@dbidwell94/ts-utils";

export class MultiPeerEmitError<
  TEvents extends VoidMethods<TEvents>,
> extends Error {
  peers: PeerId[];
  eventName: keyof TEvents;
  constructor(peers: PeerId[], eventName: keyof TEvents) {
    super("Failed to emit event to peers");
    this.peers = peers;
    this.eventName = eventName;
  }
}

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

    /**
     * Emits an event to a specific peerId. If the peerId is not connected
     * or there was an error sending the message, a `Failure` result type will be returned.
     *
     * @param toPeer Which peer we want to emit the event to
     * @param eventName the event we want to emit
     * @param args All the arguments for the event
     *
     * @returns Promise<Result<void>> If emitting was successful, a `Success` variant will be
     * returned. Otherwise it will be a `Failure` variant
     */
    async function emitTo<TKey extends keyof TEvents>(
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

    /**
     * Emits an event to all connected peers. If there was an error sending a message to a peer,
     * we will continue sending to others and return a `Failure<MultiPeerEmitError>`, which will
     * contain the eventName which was emitted, as well as any peerId that we failed to send to
     *
     * @param eventName The event we want to emit
     * @param args All the arguments for the event
     * @returns Promise<Result<void, MultiPeerEmitError>> If emitting was successful, a `Success`
     * variant will be returned. Otherwise it will be a `Failure<MultiPeerEmitError>`
     */
    async function emit<TKey extends keyof TEvents>(
      eventName: TKey,
      ...args: Parameters<TEvents[TKey]>
    ): Promise<Result<void, MultiPeerEmitError<TEvents>>> {
      const failedEmitting: PeerId[] = [];
      for (const peerId of ctx.peerIds) {
        const res = await emitTo(peerId, eventName, ...args);
        if (res.isError()) {
          failedEmitting.push(peerId);
        }
      }

      if (failedEmitting.length > 0) {
        return result.err(
          new MultiPeerEmitError(failedEmitting, eventName as keyof TEvents),
        );
      }
      return result.ok(undefined);
    }

    return { emitTo, emit };
  };
}
