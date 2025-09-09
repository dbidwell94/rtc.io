import { VoidMethods } from "@rtcio/core";
import { createUsePeerListener } from "./usePeerListener";
import { createUseRtcListener } from "./useRtcListener";
import { createUsePeerEmitter } from "./usePeerEmitter";

export function createTypedHooks<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return {
    usePeerListener: createUsePeerListener<TEvents>(),
    useRtcListener: createUseRtcListener<TEvents>(),
    usePeerEmitter: createUsePeerEmitter<TEvents>(),
  };
}
