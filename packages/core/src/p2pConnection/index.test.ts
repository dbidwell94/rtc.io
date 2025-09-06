import waitFor from "wait-for-expect";
import LocalSignalServer from "@rtcio/signal-local";
import { InternalEvents, P2PConnection, VoidMethods } from ".";
import { RTC, RtcOptions } from "../manager";
import { JsonObject } from "./binaryData";
import { Option } from "@dbidwell94/ts-utils";

interface Events {
  test: (arg1: string) => void;
}

async function createPeers<T extends VoidMethods<T>>(
  options?: Partial<Omit<RtcOptions, "signaler" | "roomName">>
): Promise<[P2PConnection<T>, P2PConnection<T>, RTC<T>, RTC<T>]> {
  const opts: Omit<RtcOptions, "signaler"> = {
    roomName: crypto.randomUUID(),
    dataTimeoutMs: options?.dataTimeoutMs,
    iceServers: options?.iceServers,
    maxChunkSizeBytes: options?.maxChunkSizeBytes,
  };

  const manager1 = new RTC<T>({
    ...opts,
    signaler: new LocalSignalServer(opts.roomName),
  });

  const peer1Promise = new Promise<P2PConnection<T>>((res) => {
    manager1.on("connected", (peer) => res(peer));
  });

  const manager2 = new RTC<T>({
    ...opts,
    signaler: new LocalSignalServer(opts.roomName),
  });

  const manager2Id = (await manager2.connectToRoom()).unwrap();

  const peer2Promise = new Promise<P2PConnection<T>>((res) => {
    manager2.on("connected", (peer) => res(peer));
  });

  manager2.on("connectionRequest", async (req) => await req.accept());
  await manager1.connectToPeer(manager2Id);

  const peer1 = await peer1Promise;
  const peer2 = await peer2Promise;

  return [peer1, peer2, manager1, manager2];
}

async function close(...peers: { close: () => Promise<void> }[]) {
  await Promise.all(peers.map((peer) => peer.close()));
}

describe("src/p2pConnection/index.ts", () => {
  it("Sends custom events", async () => {
    const eventItem = "TEST";
    const [peer1, peer2, m1, m2] = await createPeers<Events>();

    const receivedEvent = new Promise<string>((res) =>
      peer2.on("test", (data) => res(data))
    );

    await peer1.emit("test", eventItem);

    expect(await receivedEvent).toEqual(eventItem);

    await close(peer1, peer2, m1, m2);
  });

  it("Unsubscribes from events", async () => {
    const testData = "TEST";
    const spy = jest.fn();

    const [peer1, peer2, m1, m2] = await createPeers<Events>();

    peer1.on("test", spy);
    expect((await peer2.emit("test", testData)).isOk()).toBe(true);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(testData);
    });

    const stringRecvSpy = jest.spyOn(peer1, "callHandlers" as any);

    peer1.off("test", spy);

    expect((await peer2.emit("test", testData)).isOk()).toBe(true);

    await waitFor(() => {
      expect(stringRecvSpy).toHaveBeenCalledTimes(1);
    });

    spy.mockClear();

    expect(spy).toHaveBeenCalledTimes(0);

    await close(peer1, peer2, m1, m2);
  });

  it("Only calls handlers one time for a one shot event", async () => {
    const testData = "TEST";
    const [peer1, peer2, m1, m2] = await createPeers<Events>();

    const spy = jest.fn();
    peer1.once("test", spy);

    for (let i = 0; i < 10; i++) {
      expect((await peer2.emit("test", testData)).isOk()).toBe(true);
    }

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });

    await close(peer1, peer2, m1, m2);
  });

  it("Only calls handlers one time if an event is fired once", async () => {
    const testData = "TEST";
    const [peer1, peer2, m1, m2] = await createPeers<Events>();

    const spy = jest.fn();
    peer1.on("test", spy);

    expect((await peer2.emit("test", testData)).isOk()).toBe(true);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });

    await close(peer1, peer2, m1, m2);
  });

  it("Reconstructs binary data with metadata as a data event", async () => {
    interface Metadata extends JsonObject {
      name: string;
    }
    const metadata: Metadata = {
      name: "TEST",
    };
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const [peer1, peer2, m1, m2] = await createPeers<Events>();

    const dataProm = new Promise<[Option<unknown>, ArrayBuffer]>((res) =>
      peer2.on("data", (meta, data) => res([meta as Option<unknown>, data]))
    );

    peer1.sendRaw<Metadata>(data.buffer, metadata);

    const [recvMetadata, recvData] = await dataProm;

    expect(recvData).toEqual(data.buffer);
    expect(recvMetadata.unsafeUnwrap()).toEqual(metadata);

    await close(peer1, peer2, m1, m2);
  });

  it("Sends a closed event to a connected peer when one peer closes the connection", async () => {
    const [peer1, peer2, manager1, manager2] = await createPeers();

    const onClose = jest.fn();
    const onError = jest.fn();

    peer1.on("connectionClosed", onClose);
    peer2.on("connectionClosed", onClose);

    peer1.on("error", onError);
    peer2.on("error", onError);

    await peer2.close();

    await waitFor(() => {
      expect(manager1["_connectedPeers"].size).toEqual(0);
      expect(manager1["_pendingPeers"].size).toEqual(0);
      expect(manager2["_connectedPeers"].size).toEqual(0);
      expect(manager2["_pendingPeers"].size).toEqual(0);
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    expect(onError).not.toHaveBeenCalled();

    await close(peer1, peer2, manager1, manager2);
  });

  it("Sends file data as raw data", async () => {
    const fileData = new Uint8Array([1, 2, 3, 4, 5]);
    const fileOpts: FilePropertyBag = {
      type: "text/plain",
      lastModified: Date.now(),
    };
    const file = new File([fileData], "test.txt", fileOpts);

    const [peer1, peer2, m1, m2] = await createPeers();

    const dataProm = new Promise<[Parameters<InternalEvents["file"]>[0], Blob]>(
      (res) => peer2.on("file", (metadata, file) => res([metadata, file]))
    );
    expect((await peer1.sendFile(file)).isOk()).toBe(true);

    const [recvMetadata, recvFile] = await dataProm;

    expect(recvMetadata.name).toBe(file.name);
    expect(recvMetadata.size).toBe(file.size);
    expect(recvMetadata.type).toBe(file.type);
    expect(recvMetadata.lastModified).toBe(file.lastModified);

    const recvFileData = new Uint8Array(await recvFile.arrayBuffer());
    expect(recvFileData).toEqual(fileData);

    await close(peer1, peer2, m1, m2);
  });

  it("Sends the file as a stream", async () => {
    const onError = jest.fn();
    // create a new ArrayBuffer with 512KB of data, with each byte set to its index % 256
    const buffer = new Uint8Array(1024 * 512);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = i % 256;
    }
    const fileOpts: FilePropertyBag = {
      type: "text/plain",
      lastModified: Date.now(),
    };
    const file = new File([buffer], "largefile.txt", fileOpts);
    // Set max chunk size to 1KB to force chunking
    const [peer1, peer2, m1, m2] = await createPeers({
      maxChunkSizeBytes: 1024,
    });

    let resolveData: (
      value: [Parameters<InternalEvents["fileStream"]>[0], Uint8Array]
    ) => void;
    const dataProm = new Promise<
      [Parameters<InternalEvents["fileStream"]>[0], Uint8Array]
    >((res) => {
      resolveData = res;
    });

    peer1.on("error", onError);
    peer2.on("error", onError);

    peer2.on("fileStream", async (metadata, stream) => {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (value) chunks.push(value);
        done = streamDone;
      }
      // Concatenate all chunks into a single Uint8Array
      const totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      resolveData([metadata, result]);
    });

    peer1.sendFile(file);

    const [recvMetadata, recvData] = await dataProm;
    expect(recvData).toEqual(buffer);
    expect(recvMetadata.name).toBe(file.name);
    expect(recvMetadata.size).toBe(file.size);
    expect(recvMetadata.type).toBe(file.type);
    expect(recvMetadata.lastModified).toBe(file.lastModified);

    expect(onError).not.toHaveBeenCalled();

    await close(peer1, peer2, m1, m2);
  });

  it("Cleans up properly when closed", async () => {
    const [peer1, peer2, manager1, manager2] = await createPeers<Events>();

    const abortController = new AbortController();
    const signal = abortController.signal;

    const onClose1 = jest.fn();
    const onClose2 = jest.fn();
    const onError1 = jest.fn();
    const onError2 = jest.fn();

    peer1.on("connectionClosed", onClose1);
    peer2.on("connectionClosed", onClose2);

    peer1.on("error", onError1);
    peer2.on("error", onError2);

    peer1.on("test", () => {}, signal);
    peer2.on("test", () => {}, signal);

    await peer1.close();
    await peer2.close();

    await waitFor(() => {
      expect(manager1["_connectedPeers"].size).toEqual(0);
      expect(manager1["_pendingPeers"].size).toEqual(0);
      expect(manager2["_connectedPeers"].size).toEqual(0);
      expect(manager2["_pendingPeers"].size).toEqual(0);
    });

    await waitFor(() => {
      expect(onClose1).toHaveBeenCalledTimes(1);
      expect(onClose2).toHaveBeenCalledTimes(1);
      expect(peer1["_eventAbortSignals"].size).toBe(0);
      expect(peer2["_eventAbortSignals"].size).toBe(0);
      expect(signal["onabort"]).toBeNull();

      expect(Object.keys(peer1["_events"])).toHaveLength(0);
      expect(Object.keys(peer2["_events"])).toHaveLength(0);

      expect(Object.keys(peer1["_oneShotEvents"])).toHaveLength(0);
      expect(Object.keys(peer2["_oneShotEvents"])).toHaveLength(0);
    });

    expect(onError1).not.toHaveBeenCalled();
    expect(onError2).not.toHaveBeenCalled();

    expect(peer1["_connection"].connectionState).toBe("closed");
    expect(peer1["_data"].readyState).toBe("closed");
    expect(peer1["_binaryData"].readyState).toBe("closed");

    expect(peer2["_connection"].connectionState).toBe("closed");
    expect(peer2["_data"].readyState).toBe("closed");
    expect(peer2["_binaryData"].readyState).toBe("closed");

    await close(manager1, manager2);
  });
});
