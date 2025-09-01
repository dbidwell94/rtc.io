import { ReactNode } from "react";
import { VoidMethods } from "@rtcio/core";
import * as rtcCore from "@rtcio/core";
import Provider from "../provider";
import LocalSignaler from "@rtcio/signal-local";
import { result } from "@dbidwell94/ts-utils";

export function ProviderWrapper<T extends VoidMethods<T>>({
  children,
}: {
  children?: ReactNode;
}) {
  return (
    <Provider roomName="TEST_ROOM" signaler={new LocalSignaler("TEST_ROOM")}>
      {children}
    </Provider>
  );
}

export function createMockRtc<TEvents extends VoidMethods<TEvents>>() {
  const closeSpy = jest.fn();
  const onSpy = jest.fn();
  const offSpy = jest.fn();
  const connectSpy = jest.fn(() => Promise.resolve(result.ok("TEST_ID")));

  return {
    closeSpy,
    onSpy,
    offSpy,
    connectSpy,
    rtc: jest.spyOn(rtcCore, "RTC").mockImplementation(
      () =>
        ({
          on: onSpy,
          off: offSpy,
          close: closeSpy,
          connectToRoom: connectSpy,
        }) as never,
    ),
  };
}
