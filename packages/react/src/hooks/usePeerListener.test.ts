import { act, waitFor } from "@testing-library/react";
import { renderHook } from "../testUtils/renderHook";
import { createUsePeerListener } from "./usePeerListener";
import { createUseRtcListener } from "./useRtcListener";
import { usePeerContext } from "./usePeerContext";
import { P2PConnectionEventMap, VoidMethods } from "@rtcio/core";
import { describe, it, vitest, expect } from "vitest";

function createUseRtcSuite<
  TEvents extends VoidMethods<TEvents> = Record<string, never>,
>() {
  return function useRtcSuite<
    TKey extends keyof P2PConnectionEventMap<TEvents>,
  >(event: TKey, callback: P2PConnectionEventMap<TEvents>[TKey]) {
    const usePeerListener = createUsePeerListener<TEvents>();
    const useRtcListener = createUseRtcListener<TEvents>();

    const { peers, peerIds, rtc } = usePeerContext<TEvents>();
    useRtcListener("connectionRequest", (req) => req.accept());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usePeerListener(event as any, callback);

    return {
      peers,
      peerIds,
      rtc,
    };
  };
}

describe("src/hooks/usePeerListener.ts", () => {
  it("Subscribes to events as peers come in", async () => {
    const useRtcSuite = createUseRtcSuite();
    const sub1 = vitest.fn();
    const sub2 = vitest.fn();
    const roomName = crypto.randomUUID();

    const { result: res1 } = renderHook(roomName, () =>
      useRtcSuite("error", sub1),
    );

    const { result: res2 } = renderHook(roomName, () =>
      useRtcSuite("error", sub2),
    );

    await waitFor(() => {
      expect(res1.current.rtc.isSome()).toBeTruthy();
      expect(res2.current.rtc.isSome()).toBeTruthy();
    });

    res1.current.rtc.inspect((val) =>
      val.rtc.connectToPeer(res2.current.rtc.unwrap().myId),
    );

    await waitFor(() => {
      expect(res2.current.peerIds).toHaveLength(1);
      expect(res1.current.peerIds).toHaveLength(1);
    });

    await waitFor(() => {
      const peers1 = Array.from(res1.current.peers.current.values());
      const peers2 = Array.from(res2.current.peers.current.values());

      expect(
        peers1.every((peer) => peer["_events"]["error"].size === 1),
      ).toBeTruthy();

      expect(
        peers2.every((peer) => peer["_events"]["error"].size === 1),
      ).toBeTruthy();
    });
  });

  it("Fires callbacks for custom events", async () => {
    const roomName = crypto.randomUUID();
    const fired = vitest.fn();
    const expectedMessage = "TEST_MESSAGE";
    interface Events {
      custom: (message: string) => void;
    }
    const useRtcSuite = createUseRtcSuite<Events>();

    const { result: res1 } = renderHook(roomName, () =>
      useRtcSuite("custom", fired),
    );
    const { result: res2 } = renderHook(roomName, () =>
      useRtcSuite("custom", () => {}),
    );

    await waitFor(() => {
      expect(res1.current.rtc.isSome()).toBeTruthy();
      expect(res2.current.rtc.isSome()).toBeTruthy();
    });

    res1.current.rtc.inspect((val) =>
      val.rtc.connectToPeer(res2.current.rtc.unwrap().myId),
    );

    await waitFor(() => {
      expect(res1.current.peerIds).toHaveLength(1);
      expect(res2.current.peerIds).toHaveLength(1);
    });

    res2.current.peers.current.forEach((peer) =>
      peer.emit("custom", expectedMessage),
    );

    await waitFor(() => {
      expect(fired).toHaveBeenCalledTimes(1);
      expect(fired).toHaveBeenCalledWith(expectedMessage);
    });
  });

  it("Unsubscribed to events if the name of the event changes", async () => {
    const roomName = crypto.randomUUID();
    interface Events {
      custom1: () => void;
      custom2: () => void;
    }

    const useRtcSuite = createUseRtcSuite<Events>();

    const { result: res1, rerender: rerender1 } = renderHook(
      roomName,
      ({ eventName }) => useRtcSuite(eventName, () => {}),
      { initialProps: { eventName: "custom1" as keyof Events } },
    );
    const { result: res2 } = renderHook(roomName, () =>
      useRtcSuite("custom1", () => {}),
    );

    await waitFor(() => {
      expect(res1.current.rtc.isSome()).toBeTruthy();
      expect(res2.current.rtc.isSome()).toBeTruthy();
    });

    res1.current.rtc.inspect((val) =>
      val.rtc.connectToPeer(res2.current.rtc.unwrap().myId),
    );

    await waitFor(() => {
      expect(res1.current.peerIds).toHaveLength(1);
      expect(res2.current.peerIds).toHaveLength(1);
    });

    await waitFor(() => {
      // event `custom1` should be subscribed to
      expect(
        Array.from(res1.current.peers.current.values()).every(
          (val) => val["_events"]["custom1"].size === 1,
        ),
      );
      // event `custom2` should NOT be subscribed to
      expect(
        Array.from(res1.current.peers.current.values()).every(
          (val) => val["_events"]["custom2"] === undefined,
        ),
      );
    });

    act(() => {
      rerender1({ eventName: "custom2" });
    });

    await waitFor(() => {
      expect(
        Array.from(res1.current.peers.current.values()).every(
          (peer) => peer["_events"]["custom1"].size === 0,
        ),
      );
      expect(
        Array.from(res1.current.peers.current.values()).every(
          (peer) => peer["_events"]["custom2"].size === 1,
        ),
      );
    });
  });

  it("Automatically subscribes new peers to the specified event", async () => {
    const useRtcSuite = createUseRtcSuite();
    const roomName = crypto.randomUUID();

    const { result: res1 } = renderHook(roomName, () =>
      useRtcSuite("error", () => {}),
    );
    const { result: res2 } = renderHook(roomName, () =>
      useRtcSuite("error", () => {}),
    );

    await waitFor(() => {
      expect(res1.current.rtc.isSome()).toBeTruthy();
      expect(res2.current.rtc.isSome()).toBeTruthy();
    });

    res1.current.rtc.unwrap().rtc.connectToPeer(res2.current.rtc.unwrap().myId);

    await waitFor(() => {
      expect(res1.current.peerIds).toHaveLength(1);
      expect(
        Array.from(res1.current.peers.current.values()).every(
          (val) => val["_events"]["error"].size === 1,
        ),
      );
    });

    const { result: res3 } = renderHook(roomName, () => ({
      rtc: usePeerContext(),
    }));

    await waitFor(() => {
      expect(res3.current.rtc.rtc.isSome()).toBeTruthy();
    });

    res3.current.rtc.rtc
      .unwrap()
      .rtc.connectToPeer(res1.current.rtc.unwrap().myId);

    await waitFor(() => {
      expect(res1.current.peerIds).toHaveLength(2);
      expect(
        Array.from(res1.current.peers.current.values()).every(
          (val) => val["_events"]["error"].size === 1,
        ),
      );
    });
  });
});
