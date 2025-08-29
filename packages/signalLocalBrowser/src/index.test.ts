import waitFor from "wait-for-expect";
import LocalSignalServer from "./index";
import { UUID } from "@rtcio/core";

let peer1: LocalSignalServer;
let peer2: LocalSignalServer;

let peer1Id: UUID;
let peer2Id: UUID;

describe("src/index.ts", () => {
  beforeEach(async () => {
    peer1 = new LocalSignalServer();
    peer2 = new LocalSignalServer();

    peer1Id = await peer1.connectToRoom();
    peer2Id = await peer2.connectToRoom();
  });

  it("Passes rejected event to the correct peer", async () => {
    const rejected = jest.fn();

    peer2.on("connectionRejected", rejected);
    peer1.rejectOffer(peer2Id);

    await waitFor(() => {
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(rejected).toHaveBeenCalledWith(peer1Id);
    });
  });

  it("Passes offers to the correct peer", async () => {
    const onOffer = jest.fn();

    peer2.on("offer", onOffer);
    peer1.sendOffer(peer2Id, {} as never);

    await waitFor(() => {
      expect(onOffer).toHaveBeenCalledTimes(1);
      expect(onOffer).toHaveBeenCalledWith(peer1Id, expect.any(Object));
    });
  });

  it("Passes answer to the correct peer", async () => {
    const onAnswer = jest.fn();

    peer2.on("answer", onAnswer);
    peer1.sendAnswer(peer2Id, {} as never);

    await waitFor(() => {
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(peer1Id, expect.any(Object));
    });
  });

  it("Passes ICE Candidates to the correct peer", async () => {
    const onIce = jest.fn();

    peer2.on("iceCandidate", onIce);
    peer1.sendIceCandidate(peer2Id, {} as never);

    await waitFor(() => {
      expect(onIce).toHaveBeenCalledTimes(1);
      expect(onIce).toHaveBeenCalledWith(peer1Id, expect.any(Object));
    });
  });

  it("Removes event handlers", async () => {
    const onEvent = jest.fn();

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
