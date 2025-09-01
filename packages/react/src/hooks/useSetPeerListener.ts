import {
  P2PConnection,
  VoidMethods,
  type P2PConnectionEventMap,
} from "@rtcio/core";
import { useContext, useEffect, useRef } from "react";
import { type P2PContext, p2pContext } from "../provider";

export function createPeerListener<TEvents extends VoidMethods<TEvents>>() {
  const useSetPeerListener = <
    TKey extends keyof P2PConnectionEventMap<TEvents>,
  >(
    event: TKey,
    callback: P2PConnectionEventMap<TEvents>[TKey],
  ) => {
    const { peers } = useContext<P2PContext<TEvents>>(p2pContext);

    const subscriptions = useRef<
      Map<P2PConnection<TEvents>, P2PConnectionEventMap<TEvents>[TKey]>
    >(new Map());

    const callbackRef = useRef(callback);

    useEffect(() => {
      callbackRef.current = callback;
    });

    useEffect(() => {
      const subscribeToPeers = () => {
        for (const [, connection] of peers) {
          if (!subscriptions.current.has(connection)) {
            const listener = (
              ...args: Parameters<P2PConnectionEventMap<TEvents>[TKey]>
            ) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              callbackRef.current(...(args as any[]));
            };

            connection.on(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              event as any,
              listener,
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            subscriptions.current.set(connection, listener as any);
          }
        }
      };

      subscribeToPeers();

      return () => {
        for (const [, connection] of peers) {
          if (subscriptions.current.has(connection)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            connection.off(event as any, subscriptions.current.get(connection));
          }
        }
      };
    }, [peers, event]);
  };

  return useSetPeerListener;
}
