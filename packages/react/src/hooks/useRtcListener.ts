import { RTCInternalEvents, VoidMethods } from "@rtcio/core";
import { useContext, useEffect, useRef } from "react";
import { P2PContext, p2pContext } from "../Provider";

export function createUseRtcListener<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return function useRtcListener<TKey extends keyof RTCInternalEvents<TEvents>>(
    event: TKey,
    callback: RTCInternalEvents<TEvents>[TKey],
  ) {
    const ctx = useContext<P2PContext<TEvents>>(p2pContext);

    if (!ctx) {
      throw new Error("useRtcListener must be called in a P2PProvider");
    }

    const { rtc } = ctx;

    const callbackRef = useRef(callback);

    useEffect(() => {
      callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (...args: any[]) => (callbackRef.current as any)(...args);

      rtc.inspect(({ rtc: manager }) => manager.on(event, handler));

      return () => {
        rtc.inspect(({ rtc: manager }) => manager.off(event, handler));
      };
    }, [event, rtc]);
  };
}
