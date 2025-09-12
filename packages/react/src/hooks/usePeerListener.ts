/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  P2PConnection,
  P2PConnectionEventMap,
  P2PInternalEvents,
  PeerId,
  VoidMethods,
} from "@rtcio/core";
import { useContext, useEffect, useRef } from "react";
import { P2PContext, p2pContext } from "../Provider";
import { option } from "@dbidwell94/ts-utils";

export type WithPeerId<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
> = {
  [TKey in keyof TEvents]: (
    peerId: PeerId,
    ...params: Parameters<TEvents[TKey]>
  ) => void;
};

/**
 * This function will create a typed usePeerListener hook
 * which will allow strongly typed event subscriptions
 */
export function createUsePeerListener<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  /**
   * This hook will manage subscriptions for events automatically,
   * unsubscribing if / when the event changes, the callback changes,
   * any time a new peer connects, it will automatically get
   * subscribed to this event callback. The peerId will automatically
   * be the first item passed into the callback, so account for that
   * when creating your handler.
   */
  function usePeerListener<TKey extends keyof P2PInternalEvents>(
    event: TKey,
    callback: WithPeerId<P2PInternalEvents>[TKey],
    onlyPeerId?: PeerId,
  ): void;
  /**
   * This hook will manage subscriptions for events automatically,
   * unsubscribing if / when the event changes, the callback changes,
   * any time a new peer connects, it will automatically get
   * subscribed to this event callback. The peerId will automatically
   * be the first item passed into the callback, so account for that
   * when creating your handler.
   */
  function usePeerListener<TKey extends keyof TEvents>(
    event: TKey,
    callback: WithPeerId<TEvents>[TKey],
    onlyPeerId?: PeerId,
  ): void;
  function usePeerListener<TKey extends keyof P2PConnectionEventMap<TEvents>>(
    event: TKey,
    callback: WithPeerId<P2PConnectionEventMap<TEvents>>[TKey],
    onlyPeerId?: PeerId,
  ) {
    type Subscription = {
      eventName: TKey;
      controller: AbortController;
    };

    const ctx = useContext<P2PContext<TEvents>>(p2pContext);

    if (!ctx) {
      throw new Error("usePeerListener must be called in a P2PProvider");
    }
    const { peerIds, peers } = ctx;

    const subscribedPeers = useRef(new Map<PeerId, Subscription>());
    const callbackRef = useRef(callback);
    useEffect(() => {
      callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
      const subs = subscribedPeers.current;
      const currentPeerIds = new Set(peerIds);

      // 1. Clean up stale subscriptions.
      // This runs for peers that have left OR if the event name has changed.
      for (const [peerId, sub] of subs.entries()) {
        if (
          !currentPeerIds.has(peerId) ||
          sub.eventName !== event ||
          (onlyPeerId && peerId !== onlyPeerId)
        ) {
          sub.controller.abort();
          subs.delete(peerId);
        }
      }

      const iterable = option
        .unknown(onlyPeerId)
        .andThen((val) => {
          if (peers.current.get(val)) {
            return option.some<[PeerId, P2PConnection<TEvents>]>([
              val,
              peers.current.get(val)!,
            ]);
          }
          return option.none<[PeerId, P2PConnection<TEvents>]>();
        })
        .map(([peerId, conn]) => new Map([[peerId, conn]]).entries())
        .unwrapOr(peers.current.entries());

      // 2. Add subscriptions for new peers.
      for (const [peerId, peer] of iterable) {
        // If a subscription for this peer doesn't already exist, create one.
        if (!subs.has(peerId)) {
          const controller = new AbortController();

          // The handler always calls the latest callback from the ref.
          const handler = (...args: any[]) =>
            callbackRef.current(peerId, ...(args as any));

          peer.on(event as any, handler, controller.signal);
          subs.set(peerId, { eventName: event, controller });
        }
      }
    }, [peerIds, event, onlyPeerId]);

    // 3. When component unmounts, clean up all subscriptions
    useEffect(() => {
      return () => {
        for (const [peerId, sub] of subscribedPeers.current.entries()) {
          sub.controller.abort();
          subscribedPeers.current.delete(peerId);
        }
      };
    }, []);
  }

  return usePeerListener;
}
