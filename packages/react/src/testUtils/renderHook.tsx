import { renderHook as reactRenderHook } from "@testing-library/react";
import P2PProvider from "../Provider";
import LocalSignaler from "@rtcio/signal-local";
import { PropsWithChildren, useMemo } from "react";

export function createWrapper(roomName: string) {
  const wrapper: React.FC<PropsWithChildren> = ({ children }) => {
    const signaler = useMemo(() => new LocalSignaler(roomName), []);

    return (
      <P2PProvider roomName={roomName} signaler={signaler}>
        {children}
      </P2PProvider>
    );
  };

  return [wrapper];
}

type RenderHookArgs<TProps, TResult> = Parameters<
  typeof reactRenderHook<TProps, TResult>
>;

export function renderHook<TProps, TResult>(
  roomName: string,
  ...[hook, hookOpts]: RenderHookArgs<TProps, TResult>
) {
  return reactRenderHook(hook, {
    ...hookOpts,
    wrapper: hookOpts?.wrapper ?? createWrapper(roomName)[0],
  });
}
