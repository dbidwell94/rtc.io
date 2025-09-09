import { VoidMethods } from "@rtcio/core";
import { createUsePeerListener } from "./usePeerListener";

export function createTypedHooks<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return {
    usePeerListener: createUsePeerListener<TEvents>(),
  };
}
