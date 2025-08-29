import waitFor from "wait-for-expect";
import { RTC } from "./manager";
import LocalSignal from "@rtcio/signal-local";
import { UUID } from "./signaling";

let signal1: LocalSignal;
let signal2: LocalSignal;

let peer1Id: UUID;
let peer2Id: UUID;

const ROOM_NAME = "ROOM";

describe("src/manager.ts", () => {
  beforeEach(async () => {
    signal1 = new LocalSignal();
    signal2 = new LocalSignal();

    peer1Id = await signal1.connectToRoom();
    peer2Id = await signal2.connectToRoom();
  });

  it("Connects 2 peers together", async () => {
    const firstConnected = jest.fn();
    const secondConnected = jest.fn();
    const p2p1 = new RTC(signal1, ROOM_NAME);
    p2p1.on("connected", firstConnected);

    const p2p2 = new RTC(signal2, ROOM_NAME);
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

    await Promise.all([p2p1.close(), p2p2.close()]);
  });

  it("Creates data channels and allows for messages to be passed between each other", async () => {
    const testMessage = "TEST_MESSAGE";
    interface TestInterface {
      message: (messageText: string) => void;
    }

    const onP2p1Message = jest.fn();

    const p2p1 = new RTC<TestInterface>(signal1, ROOM_NAME);
    p2p1.on("connected", (p2p) => {
      p2p.on("message", onP2p1Message);
    });

    const p2p2 = new RTC<TestInterface>(signal2, ROOM_NAME);
    p2p2.on("connected", (p2p) => {
      p2p.emit("message", testMessage);
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

    await Promise.all([p2p1.close(), p2p2.close()]);
  });
});
