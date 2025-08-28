import { createBus, TestSignaler, waitFor } from "@testUtils/index";
import { RTC } from "./manager";

const teardownFns: Array<() => Promise<void>> = [];

describe("src/manager.ts", () => {
  afterEach(async () => {
    let fn = teardownFns.pop();
    while (fn) {
      await fn();
      fn = teardownFns.pop();
    }
  });
  it("Connects 2 peers together", async () => {
    const roomName = "ROOM";
    const bus = createBus();

    const firstId = crypto.randomUUID();
    const firstConnected = jest.fn();
    const secondId = crypto.randomUUID();
    const secondConnected = jest.fn();

    const p2p1 = new RTC(new TestSignaler(firstId, bus), roomName);
    teardownFns.push(() => p2p1.close());
    p2p1.on("connected", firstConnected);

    const p2p2 = new RTC(new TestSignaler(secondId, bus), roomName);
    teardownFns.push(() => p2p2.close());
    p2p2.on("connected", secondConnected);

    await p2p1.connect();
    await p2p2.connect();

    p2p2.on("connectionRequest", async (req) => {
      if (req.remoteId == firstId) {
        await req.accept();
      }
    });

    await p2p1.connectToPeer(secondId);

    await waitFor(() => {
      expect(firstConnected).toHaveBeenCalledTimes(1);
      expect(secondConnected).toHaveBeenCalledTimes(1);
    });
  });

  it.only("Creates data channels and allows for messages to be passed between each other", async () => {
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
    teardownFns.push(() => p2p1.close());
    p2p1.on("connected", (p2p) => {
      p2p.on("message", onP2p1Message);
    });

    const p2p2 = new RTC<TestInterface>(new TestSignaler(p2id, bus), roomName);
    teardownFns.push(() => p2p2.close());
    p2p2.on("connected", (p2p) => {
      p2p.emit("message", testMessage);
    });
    p2p2.on("connectionRequest", async (offer) => {
      if (offer.remoteId === p1id) {
        await offer.accept();
      }
    });

    await p2p1.connectToPeer(p2id);

    await waitFor(
      () => {
        expect(onP2p1Message).toHaveBeenCalledTimes(1);
      },
      { timeout: 10_000 },
    );
  });
});
