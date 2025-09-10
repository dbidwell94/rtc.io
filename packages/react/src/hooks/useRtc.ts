import { VoidMethods } from "@rtcio/core";
import { usePeerContext } from "./usePeerContext";
import { useMemo } from "react";

export function useRtc<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  const ctx = usePeerContext<TEvents>();
  if (!ctx) {
    throw new Error("useRtc must be called in a P2PProvider");
  }

  return useMemo(() => {
    return ctx.rtc.map((rtc) => rtc.rtc);
  }, [ctx.rtc]);
}
