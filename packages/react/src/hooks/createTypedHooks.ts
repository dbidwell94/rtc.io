import { VoidMethods } from "@rtcio/core";
import { createUsePeerListener } from "./usePeerListener";
import { createUseRtcListener } from "./useRtcListener";

export function createTypedHooks<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return {
    usePeerListener: createUsePeerListener<TEvents>(),
    useRtcListener: createUseRtcListener<TEvents>(),
  };
}
