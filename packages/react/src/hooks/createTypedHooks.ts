import { VoidMethods } from "@rtcio/core";
import { createUsePeerListener } from "./usePeerListener";
import { createUseRtcListener } from "./useRtcListener";
import { createUsePeerEmitter } from "./usePeerEmitter";
import { createUsePeers } from "./usePeers";
import { useRtc } from "./useRtc";

export function createTypedHooks<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return {
    usePeerListener: createUsePeerListener<TEvents>(),
    useRtcListener: createUseRtcListener<TEvents>(),
    usePeerEmitter: createUsePeerEmitter<TEvents>(),
    usePeers: createUsePeers<TEvents>(),
    useRtc: useRtc<TEvents>,
  };
}
