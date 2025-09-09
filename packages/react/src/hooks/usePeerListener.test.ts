import { act, waitFor } from "@testing-library/react";
import { renderHook } from "../testUtils/renderHook";
import { createUsePeerListener } from "./usePeerListener";
import { createUseRtcListener } from "./useRtcListener";
import { usePeerContext } from "./usePeerContext";

describe("src/hooks/usePeerListener.ts", () => {
  it("Subscribes to events as peers come in", async () => {
    const sub1 = jest.fn();
    const sub2 = jest.fn();
    const usePeerListener = createUsePeerListener();
    const useRtcListener = createUseRtcListener();
    const roomName = crypto.randomUUID();

    const { result: res1 } = renderHook(roomName, () => ({
      useListener: usePeerListener("error", sub1),
      context: usePeerContext(),
    }));

    const { result: res2 } = renderHook(roomName, () => ({
      useListener: usePeerListener("error", sub2),
      rtc: useRtcListener("connectionRequest", (req) => req.accept()),
      context: usePeerContext(),
    }));

    await waitFor(() => {
      expect(res1.current.context.rtc.isSome()).toBeTruthy();
      expect(res2.current.context.rtc.isSome()).toBeTruthy();
    });

    res1.current.context.rtc.inspect((val) =>
      val.rtc.connectToPeer(res2.current.context.rtc.unwrap().myId),
    );

    await waitFor(() => {
      expect(res2.current.context.peerIds).toHaveLength(1);
      expect(res1.current.context.peerIds).toHaveLength(1);
    });

    await waitFor(() => {
      const peers1 = Array.from(res1.current.context.peers.current.values());
      const peers2 = Array.from(res2.current.context.peers.current.values());

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
    const fired = jest.fn();
    const expectedMessage = "TEST_MESSAGE";
    interface Events {
      custom: (message: string) => void;
    }

    const usePeerListener = createUsePeerListener<Events>();
    const useRtcListener = createUseRtcListener<Events>();

    const { result: res1 } = renderHook(roomName, () => ({
      listener: usePeerListener("custom", fired),
      context: usePeerContext<Events>(),
    }));
    const { result: res2 } = renderHook(roomName, () => ({
      listener: usePeerListener("custom", () => {}),
      rtc: useRtcListener("connectionRequest", (req) => req.accept()),
      context: usePeerContext<Events>(),
    }));

    await waitFor(() => {
      expect(res1.current.context.rtc.isSome()).toBeTruthy();
      expect(res2.current.context.rtc.isSome()).toBeTruthy();
    });

    res1.current.context.rtc.inspect((val) =>
      val.rtc.connectToPeer(res2.current.context.rtc.unwrap().myId),
    );

    await waitFor(() => {
      expect(res1.current.context.peerIds).toHaveLength(1);
      expect(res2.current.context.peerIds).toHaveLength(1);
    });

    res2.current.context.peers.current.forEach((peer) =>
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

    const usePeerListener = createUsePeerListener<Events>();
    const useRtcListener = createUseRtcListener<Events>();

    const { result: res1, rerender: rerender1 } = renderHook(
      roomName,
      ({ eventName }) => ({
        listener: usePeerListener(eventName, () => {}),
        context: usePeerContext<Events>(),
      }),
      { initialProps: { eventName: "custom1" as keyof Events } },
    );
    const { result: res2 } = renderHook(roomName, () => ({
      listener: usePeerListener("custom1", () => {}),
      rtc: useRtcListener("connectionRequest", (req) => req.accept()),
      context: usePeerContext<Events>(),
    }));

    await waitFor(() => {
      expect(res1.current.context.rtc.isSome()).toBeTruthy();
      expect(res2.current.context.rtc.isSome()).toBeTruthy();
    });

    res1.current.context.rtc.inspect((val) =>
      val.rtc.connectToPeer(res2.current.context.rtc.unwrap().myId),
    );

    await waitFor(() => {
      expect(res1.current.context.peerIds).toHaveLength(1);
      expect(res2.current.context.peerIds).toHaveLength(1);
    });

    await waitFor(() => {
      // event `custom1` should be subscribed to
      expect(
        Array.from(res1.current.context.peers.current.values()).every(
          (val) => val["_events"]["custom1"].size === 1,
        ),
      );
      // event `custom2` should NOT be subscribed to
      expect(
        Array.from(res1.current.context.peers.current.values()).every(
          (val) => val["_events"]["custom2"] === undefined,
        ),
      );
    });

    act(() => {
      rerender1({ eventName: "custom2" });
    });

    await waitFor(() => {
      expect(
        Array.from(res1.current.context.peers.current.values()).every(
          (peer) => peer["_events"]["custom1"].size === 0,
        ),
      );
      expect(
        Array.from(res1.current.context.peers.current.values()).every(
          (peer) => peer["_events"]["custom2"].size === 1,
        ),
      );
    });
  });

  it("Automatically subscribes new peers to the specified event", async () => {
    const roomName = crypto.randomUUID();

    const usePeerListener = createUsePeerListener();
    const useRtcListener = createUseRtcListener();

    const { result: res1 } = renderHook(roomName, () => ({
      rtc: usePeerContext(),
      peerHandler: usePeerListener("error", () => {}),
      rtcHandler: useRtcListener("connectionRequest", (req) => req.accept()),
    }));
    const { result: res2 } = renderHook(roomName, () => ({
      rtc: usePeerContext(),
      peerHandler: usePeerListener("error", () => {}),
      rtcHander: useRtcListener("connectionRequest", (req) => req.accept()),
    }));

    await waitFor(() => {
      expect(res1.current.rtc.rtc.isSome()).toBeTruthy();
      expect(res2.current.rtc.rtc.isSome()).toBeTruthy();
    });

    res1.current.rtc.rtc
      .unwrap()
      .rtc.connectToPeer(res2.current.rtc.rtc.unwrap().myId);

    await waitFor(() => {
      expect(res1.current.rtc.peerIds).toHaveLength(1);
      expect(
        Array.from(res1.current.rtc.peers.current.values()).every(
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
      .rtc.connectToPeer(res1.current.rtc.rtc.unwrap().myId);

    await waitFor(() => {
      expect(res1.current.rtc.peerIds).toHaveLength(2);
      expect(
        Array.from(res1.current.rtc.peers.current.values()).every(
          (val) => val["_events"]["error"].size === 1,
        ),
      );
    });
  });
});
