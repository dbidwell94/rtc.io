import { renderHook } from "../testUtils/renderHook";
import { createTypedUseRtcListener } from "./useRtcListener";
import { usePeerContext } from "./usePeerContext";
import { act, waitFor } from "@testing-library/react";
import { RTCInternalEvents } from "@rtcio/core";

describe("src/hooks/useRtcListener.ts", () => {
  it("Subscribes to RTC events", async () => {
    const useRtcListener = createTypedUseRtcListener();
    const roomName = crypto.randomUUID();

    const { result } = renderHook(roomName, () => ({
      sub: useRtcListener("connectionRequest", jest.fn()),
      rtc: usePeerContext(),
    }));

    await waitFor(() => {
      expect(result.current.rtc.rtc.isSome()).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        result.current.rtc.rtc.unwrap().rtc["_events"]["connectionRequest"]
          .size,
      ).toEqual(1);
    });
  });

  it("Unsubscribed from RTC events", async () => {
    const useRtcListener = createTypedUseRtcListener();
    const roomName = crypto.randomUUID();

    const { rerender, result } = renderHook(
      roomName,
      ({ eventName }) => ({
        sub: useRtcListener(eventName, jest.fn()),
        rtc: usePeerContext(),
      }),
      {
        initialProps: {
          eventName: "connectionRequest" as keyof RTCInternalEvents<never>,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.rtc.rtc.isSome()).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        result.current.rtc.rtc.unwrap().rtc["_events"]["connectionRequest"]
          .size,
      ).toEqual(1);
      expect(
        result.current.rtc.rtc.unwrap().rtc["_events"]["error"],
      ).toBeUndefined();
    });

    act(() => {
      rerender({ eventName: "error" });
    });

    await waitFor(() => {
      expect(
        result.current.rtc.rtc.unwrap().rtc["_events"]["connectionRequest"]
          .size,
      ).toEqual(0);
      expect(
        result.current.rtc.rtc.unwrap().rtc["_events"]["error"].size,
      ).toEqual(1);
    });
  });
});
