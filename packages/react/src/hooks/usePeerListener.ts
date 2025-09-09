/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  P2PConnectionEventMap,
  P2PInternalEvents,
  PeerId,
  VoidMethods,
} from "@rtcio/core";
import { useContext, useEffect, useRef } from "react";
import { P2PContext, p2pContext } from "../Provider";

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
   * subscribed to this event callback
   */
  function usePeerListener<TKey extends keyof P2PInternalEvents>(
    event: TKey,
    callback: P2PInternalEvents[TKey],
  ): void;
  /**
   * This hook will manage subscriptions for events automatically,
   * unsubscribing if / when the event changes, the callback changes,
   * any time a new peer connects, it will automatically get
   * subscribed to this event callback
   */
  function usePeerListener<TKey extends keyof TEvents>(
    event: TKey,
    callback: TEvents[TKey],
  ): void;
  function usePeerListener<TKey extends keyof P2PConnectionEventMap<TEvents>>(
    event: TKey,
    callback: P2PConnectionEventMap<TEvents>[TKey],
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
        if (!currentPeerIds.has(peerId) || sub.eventName !== event) {
          sub.controller.abort();
          subs.delete(peerId);
        }
      }

      // 2. Add subscriptions for new peers.
      for (const [peerId, peer] of peers.current.entries()) {
        // If a subscription for this peer doesn't already exist, create one.
        if (!subs.has(peerId)) {
          const controller = new AbortController();

          // The handler always calls the latest callback from the ref.
          const handler = (...args: any[]) =>
            callbackRef.current(...(args as any));

          peer.on(event as any, handler, controller.signal);
          subs.set(peerId, { eventName: event, controller });
        }
      }
    }, [peerIds, event]);

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
