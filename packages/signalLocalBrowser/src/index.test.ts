import { describe, beforeEach, it, vitest, expect } from "vitest";
import waitFor from "wait-for-expect";
import LocalSignalServer from "./index";
import { PeerId } from "@rtcio/signaling";

let peer1: LocalSignalServer;
let peer2: LocalSignalServer;

let peer1Id: PeerId;
let peer2Id: PeerId;

describe("src/index.ts", () => {
  beforeEach(async () => {
    const channelName = crypto.randomUUID();
    peer1 = new LocalSignalServer(channelName);
    peer2 = new LocalSignalServer(channelName);

    peer1Id = (await peer1.connectToRoom()).unwrap();
    peer2Id = (await peer2.connectToRoom()).unwrap();
  });

  it("Passes rejected event to the correct peer", async () => {
    const rejected = vitest.fn();

    peer2.on("connectionRejected", rejected);
    peer1.rejectOffer(peer2Id);

    await waitFor(() => {
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(rejected).toHaveBeenCalledWith(peer1Id);
    });
  });

  it("Passes offers to the correct peer", async () => {
    const onOffer = vitest.fn();

    peer2.on("offer", onOffer);
    peer1.sendOffer(peer2Id, {} as never);

    await waitFor(() => {
      expect(onOffer).toHaveBeenCalledTimes(1);
      expect(onOffer).toHaveBeenCalledWith(peer1Id, expect.any(Object));
    });
  });

  it("Passes answer to the correct peer", async () => {
    const onAnswer = vitest.fn();

    peer2.on("answer", onAnswer);
    peer1.sendAnswer(peer2Id, {} as never);

    await waitFor(() => {
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(peer1Id, expect.any(Object));
    });
  });

  it("Passes ICE Candidates to the correct peer", async () => {
    const onIce = vitest.fn();

    peer2.on("iceCandidate", onIce);
    peer1.sendIceCandidate(peer2Id, {} as never);

    await waitFor(() => {
      expect(onIce).toHaveBeenCalledTimes(1);
      expect(onIce).toHaveBeenCalledWith(peer1Id, expect.any(Object));
    });
  });

  it("Removes event handlers", async () => {
    const onEvent = vitest.fn();

    peer2.on("iceCandidate", onEvent);
    peer1.sendIceCandidate(peer2Id, {} as never);

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    onEvent.mockClear();

    peer2.off("iceCandidate", onEvent);
    peer1.sendIceCandidate(peer2Id, {} as never);

    await waitFor(() => {
      expect(onEvent).not.toHaveBeenCalled();
    });
  });
});
