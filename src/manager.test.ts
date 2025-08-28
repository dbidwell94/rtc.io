import { createBus, TestSignaler, waitFor } from "@testUtils/index";
import { RTC } from "./manager";

describe("src/manager.ts", () => {
  it("Connects 2 peers together", async () => {
    const roomName = "ROOM";
    const bus = createBus();

    const firstId = crypto.randomUUID();
    const firstConnected = jest.fn();
    const secondId = crypto.randomUUID();
    const secondConnected = jest.fn();

    const p2p1 = new RTC(new TestSignaler(firstId, bus), roomName);
    p2p1.on("connected", firstConnected);

    const p2p2 = new RTC(new TestSignaler(secondId, bus), roomName);
    p2p2.on("connected", secondConnected);
    p2p2.on("connectionRequest", async (req) => {
      if (req.remoteId == firstId) {
        await req.accept();
      }
    });

    await p2p1.connect();
    await p2p2.connect();

    await p2p1.connectToPeer(secondId);

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

    const bus = createBus();
    const roomName = "ROOM";

    const p1id = crypto.randomUUID();
    const p2id = crypto.randomUUID();

    const p2p1 = new RTC<TestInterface>(new TestSignaler(p1id, bus), roomName);
    p2p1.on("connected", (p2p) => {
      p2p.on("message", onP2p1Message);
    });

    const p2p2 = new RTC<TestInterface>(new TestSignaler(p2id, bus), roomName);
    p2p2.on("connected", (p2p) => {
      p2p.emit("message", testMessage);
    });
    p2p2.on("connectionRequest", async (offer) => {
      if (offer.remoteId === p1id) {
        await offer.accept();
      }
    });

    await p2p1.connectToPeer(p2id);

    await waitFor(() => {
      expect(onP2p1Message).toHaveBeenCalledTimes(1);
      expect(onP2p1Message).toHaveBeenCalledWith(testMessage);
    });

    await Promise.all([p2p1.close(), p2p2.close()]);
  });
});
