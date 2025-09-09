import { VoidMethods } from "@rtcio/core";
import { useContext } from "react";
import { p2pContext, P2PContext } from "../Provider";

export function usePeerContext<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return useContext<P2PContext<TEvents>>(p2pContext);
}
