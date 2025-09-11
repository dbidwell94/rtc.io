import type { VoidMethods } from "@rtcio/core";
import { createUsePeerListener } from "./usePeerListener";
import { createUseRtcListener } from "./useRtcListener";
import { createUsePeerEmitter } from "./usePeerEmitter";
import { createUsePeers } from "./usePeers";
import { useRtc } from "./useRtc";
import { useSignalPeers } from "./useSignalPeers";
import { useFileSender } from "./useFileSender";

export function createTypedHooks<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return {
    usePeerListener: createUsePeerListener<TEvents>(),
    useRtcListener: createUseRtcListener<TEvents>(),
    usePeerEmitter: createUsePeerEmitter<TEvents>(),
    usePeers: createUsePeers<TEvents>(),
    useRtc: useRtc<TEvents>,
    useSignalPeers,
    useFileSender,
  };
}
