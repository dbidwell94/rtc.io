import waitFor from "wait-for-expect";
import LocalSignalServer from "@rtcio/signal-local";
import { P2PConnection, VoidMethods } from ".";
import { RTC } from "../manager";
import { JsonObject } from "./binaryData";
import { Option } from "@dbidwell94/ts-utils";

interface Events {
  test: (arg1: string) => void;
}

async function createPeers<T extends VoidMethods<T>>(): Promise<
  [P2PConnection<T>, P2PConnection<T>]
> {
  const manager1 = new RTC<T>(new LocalSignalServer("TEST"), "TEST");

  const peer1Promise = new Promise<P2PConnection<T>>((res) => {
    manager1.on("connected", (peer) => res(peer));
  });

  const manager2 = new RTC<T>(new LocalSignalServer("TEST"), "TEST");
  const manager2Id = (await manager2.connectToRoom()).unwrap();

  const peer2Promise = new Promise<P2PConnection<T>>((res) => {
    manager2.on("connected", (peer) => res(peer));
  });

  manager2.on("connectionRequest", async (req) => await req.accept());
  await manager1.connectToPeer(manager2Id);

  const peer1 = await peer1Promise;
  const peer2 = await peer2Promise;

  return [peer1, peer2];
}

async function close(...peers: P2PConnection<never>[]) {
  await Promise.all(peers.map((peer) => peer.close()));
}

describe("src/p2pConnection/index.ts", () => {
  it("Sends custom events", async () => {
    const eventItem = "TEST";
    const [peer1, peer2] = await createPeers<Events>();

    const receivedEvent = new Promise<string>((res) =>
      peer2.on("test", (data) => res(data)),
    );

    peer1.emit("test", eventItem);

    expect(await receivedEvent).toEqual(eventItem);

    await close(peer1, peer2);
  });

  it("Unsubscribes from events", async () => {
    const testData = "TEST";
    const spy = jest.fn();

    const [peer1, peer2] = await createPeers<Events>();

    peer1.on("test", spy);
    peer2.emit("test", testData);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(testData);
    });

    peer1.off("test", spy);
    spy.mockClear();
    peer2.emit("test", testData);

    expect(spy).not.toHaveBeenCalled();

    await close(peer1, peer2);
  });

  it("Only calls handlers one time for a one shot event", async () => {
    const testData = "TEST";
    const [peer1, peer2] = await createPeers<Events>();

    const spy = jest.fn();
    peer1.once("test", spy);

    for (let i = 0; i < 10; i++) {
      peer2.emit("test", testData);
    }

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });

    await close(peer1, peer2);
  });

  it("Reconstructs binary data with metadata as a data event", async () => {
    interface Metadata extends JsonObject {
      name: string;
    }
    const metadata: Metadata = {
      name: "TEST",
    };
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const [peer1, peer2] = await createPeers<Events>();

    const dataProm = new Promise<[Option<unknown>, ArrayBuffer]>((res) =>
      peer2.on("data", (meta, data) => res([meta, data])),
    );

    peer1.sendRaw<Metadata>(data.buffer, metadata);

    const [recvMetadata, recvData] = await dataProm;

    expect(recvData).toEqual(data.buffer);
    expect(recvMetadata.unsafeUnwrap()).toEqual(metadata);

    await close(peer1, peer2);
  });
});
