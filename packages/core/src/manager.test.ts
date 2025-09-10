import waitFor from "wait-for-expect";
import { RTC } from "./manager";
import LocalSignal from "@rtcio/signal-local";
import { PeerId } from "@rtcio/signaling";
import { describe, it, vitest, expect, beforeEach } from "vitest";

let signal1: LocalSignal;
let signal2: LocalSignal;

let peer1Id: PeerId;
let peer2Id: PeerId;

let ROOM_NAME: string;

async function closePeers(...peers: RTC<never>[]) {
  await Promise.all(peers.map(async (peer) => await peer.close()));
}

describe("src/manager.ts", () => {
  beforeEach(async () => {
    signal1 = new LocalSignal();
    signal2 = new LocalSignal();

    peer1Id = (await signal1.connectToRoom()).unwrap();
    peer2Id = (await signal2.connectToRoom()).unwrap();

    ROOM_NAME = crypto.randomUUID();
  });

  it("Connects 2 peers together", async () => {
    const firstConnected = vitest.fn();
    const secondConnected = vitest.fn();
    const p2p1 = new RTC({ signaler: signal1, roomName: ROOM_NAME });
    p2p1.on("connected", firstConnected);

    const p2p2 = new RTC({ signaler: signal2, roomName: ROOM_NAME });
    p2p2.on("connected", secondConnected);
    p2p2.on("connectionRequest", async (req) => {
      if (req.remoteId == peer1Id) {
        await req.accept();
      }
    });

    await p2p1.connectToRoom();
    await p2p2.connectToRoom();

    await p2p1.connectToPeer(peer2Id);

    await waitFor(() => {
      expect(firstConnected).toHaveBeenCalledTimes(1);
      expect(secondConnected).toHaveBeenCalledTimes(1);
    });

    await closePeers(p2p1, p2p2);
  });

  it("Creates data channels and allows for messages to be passed between each other", async () => {
    const testMessage = "TEST_MESSAGE";
    interface TestInterface {
      message: (messageText: string) => void;
    }

    const onP2p1Message = vitest.fn();

    const p2p1 = new RTC<TestInterface>({
      signaler: signal1,
      roomName: ROOM_NAME,
    });
    p2p1.on("connected", (p2p) => {
      p2p.on("message", onP2p1Message);
    });

    const p2p2 = new RTC<TestInterface>({
      signaler: signal2,
      roomName: ROOM_NAME,
    });
    p2p2.on("connected", async (p2p) => {
      await p2p.emit("message", testMessage);
    });
    p2p2.on("connectionRequest", async (offer) => {
      if (offer.remoteId === peer1Id) {
        await offer.accept();
      }
    });

    await p2p1.connectToPeer(peer2Id);

    await waitFor(() => {
      expect(onP2p1Message).toHaveBeenCalledTimes(1);
      expect(onP2p1Message).toHaveBeenCalledWith(testMessage);
    });

    await closePeers(p2p1, p2p2);
  });
});
