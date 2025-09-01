import { RTCInternalEvents, VoidMethods } from "@rtcio/core";
import { p2pContext, type P2PContext } from "../provider";
import { useContext, useEffect, useRef } from "react";

export function useOnIncomingConnection<TEvents extends VoidMethods<TEvents>>(
  callback: RTCInternalEvents<TEvents>["connectionRequest"],
) {
  const currentCallback = useRef(callback);

  const { rtc, rtcUpdatedCount } = useContext<P2PContext<TEvents>>(p2pContext);

  useEffect(() => {
    currentCallback.current = callback;
    if (rtc.isSome()) {
      rtc.value.on("connectionRequest", callback);
    }

    return () => {
      if (rtc.isSome() && currentCallback.current !== callback) {
        rtc.value.off("connectionRequest", callback);
      }
    };
  }, [callback, rtcUpdatedCount]);
}
