import { VoidMethods } from "@rtcio/core";
import { createUsePeerEmitter } from "./usePeerEmitter";
import { createUseRtcListener } from "./useRtcListener";
import { usePeerContext } from "./usePeerContext";
import { renderHook } from "../testUtils/renderHook";
import { act, waitFor } from "@testing-library/react";
import { describe, it, vitest, expect } from "vitest";

function useRtcSuite<TEvents extends VoidMethods<TEvents>>() {
  const usePeerEmitter = createUsePeerEmitter<TEvents>();
  const useRtcListener = createUseRtcListener<TEvents>();

  const { peerIds, peers, rtc } = usePeerContext<TEvents>();
  useRtcListener("connectionRequest", (req) => req.accept());
  const emitEvent = usePeerEmitter();

  return {
    emitEvent,
    peerIds,
    peers,
    rtc,
  };
}

describe("src/hooks/usePeerEmitter.ts", () => {
  it("Emits events to the correct peer", async () => {
    const fired = vitest.fn();
    const customMessage = "HELLO WORLD";
    interface Events {
      custom: (message: string) => void;
    }
    const roomName = crypto.randomUUID();
    const { result: res1 } = renderHook(roomName, () => useRtcSuite<Events>());
    const { result: res2 } = renderHook(roomName, () => useRtcSuite<Events>());

    await waitFor(() => {
      expect(res1.current.rtc.isSome()).toBeTruthy();
      expect(res2.current.rtc.isSome()).toBeTruthy();
    });

    act(() => {
      res2.current.rtc
        .unwrap()
        .rtc.connectToPeer(res1.current.rtc.unwrap().myId);
    });

    await waitFor(() => {
      expect(res1.current.peerIds).toHaveLength(1);
      expect(res2.current.peerIds).toHaveLength(1);
    });

    res1.current.peers.current.forEach((peer) => peer.on("custom", fired));

    expect(
      (
        await res2.current.emitEvent(
          res1.current.rtc.unwrap().myId,
          "custom",
          customMessage,
        )
      ).isOk(),
    ).toBeTruthy();

    await waitFor(() => {
      expect(fired).toHaveBeenCalledTimes(1);
      expect(fired).toHaveBeenCalledWith(customMessage);
    });
  });

  it("Returns Failure type if called on a non-existent peer", async () => {
    const roomName = crypto.randomUUID();
    interface Events {
      custom: () => void;
    }

    const { result: res1 } = renderHook(roomName, () => useRtcSuite<Events>());
    const { result: res2 } = renderHook(roomName, () => useRtcSuite<Events>());

    await waitFor(() => {
      expect(res1.current.rtc.isSome()).toBeTruthy();
      expect(res2.current.rtc.isSome()).toBeTruthy();
    });

    act(() => {
      res1.current.rtc
        .unwrap()
        .rtc.connectToPeer(res2.current.rtc.unwrap().myId);
    });

    await waitFor(() => {
      expect(res1.current.peerIds).toHaveLength(1);
      expect(res2.current.peerIds).toHaveLength(1);
    });

    await expect(async () =>
      (await res1.current.emitEvent("NOPE", "custom")).unwrap(),
    ).rejects.toBeInstanceOf(Error);
  });
});
