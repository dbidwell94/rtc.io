import { option } from "@dbidwell94/ts-utils";
import { BinaryChunker, JsonObject } from "./binaryData";

describe("src/p2pConnection/binaryData.ts", () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it("Throws an error if you try to create an instance with too low a chunk size", () => {
    expect(
      () => new BinaryChunker({ onDataTimeout: jest.fn(), maxChunkSize: 1 }),
    ).toThrow();
  });

  it("Does not throw an error if the max chunk size is greater than the header size", () => {
    expect(
      () =>
        new BinaryChunker({
          onDataTimeout: jest.fn(),
          maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
        }),
    ).not.toThrow();
  });

  it("Returns the correct amount of chunks", () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
    const chunker = new BinaryChunker({
      onDataTimeout: jest.fn(),
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
    });
    const data = Array.from(chunker.chunkData(binaryData));

    // We expect 7 here because we also have a metadata chunk returned
    expect(data).toHaveLength(7);
  });

  it("Sets headers on the chunks as expected", () => {
    const binaryData = new Uint8Array([1, 2]).buffer;
    const chunker = new BinaryChunker({
      onDataTimeout: jest.fn(),
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
    });

    // First chunk is metadata
    const [, data, data2] = chunker.chunkData(binaryData);

    // this is a workaround to allow the calling of private methods in a class
    const header1 = chunker["parseHeaderFromBuffer"](data);
    const header2 = chunker["parseHeaderFromBuffer"](data2);

    expect(header1).toEqual({
      chunkIndex: 1,
      id: expect.any(String),
      isFinal: false,
    });
    expect(header1.id).toHaveLength(32);

    expect(header2).toEqual({
      chunkIndex: 2,
      id: expect.any(String),
      isFinal: true,
    });

    expect(header1.id).toEqual(header2.id);
  });

  it.each([
    [BinaryChunker.HEADER_SIZE + 1, new Uint8Array([1]).buffer],
    [BinaryChunker.HEADER_SIZE + 2, new Uint8Array([1, 2]).buffer],
  ])("Should be an expected size of %s bytes", (expectedBufferSize, buffer) => {
    const chunker = new BinaryChunker({ onDataTimeout: jest.fn() });
    const [, data] = chunker.chunkData(buffer);

    expect(data.byteLength).toEqual(expectedBufferSize);
  });

  it("Encodes metadata correctly", () => {
    const expectedMetadata = { testKey: "testValue" };
    const encoded = new TextEncoder().encode(JSON.stringify(expectedMetadata));

    const chunker = new BinaryChunker({ onDataTimeout: jest.fn() });
    const [metadata] = chunker.chunkData(
      new Uint8Array([1, 2, 3, 4, 5]).buffer,
      { testKey: "testValue" },
    );

    expect(metadata.byteLength).toEqual(
      BinaryChunker.HEADER_SIZE + encoded.byteLength,
    );
    // Ensure the underlying data excluding the header is the same as the expected
    // encoded metadata
    expect(metadata.slice(BinaryChunker.HEADER_SIZE)).toEqual(encoded.buffer);
  });

  it("Assembles data back together correctly", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const chunker = new BinaryChunker({
      onDataTimeout: jest.fn(),
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
    });

    const chunks = Array.from(chunker.chunkData(data.buffer));
    // 5 chunks and 1 metadata
    expect(chunks).toHaveLength(6);

    let finalChunk: ReturnType<typeof chunker.receiveChunk> = option.none();
    for (const chunk of chunks) {
      finalChunk = chunker.receiveChunk(chunk);
      if (finalChunk.isSome()) {
        break;
      }
    }

    expect(finalChunk.isSome()).toBeTruthy();
    const { data: assembledData, metadata } = finalChunk.unwrap();

    // we didn't pass any metadata in, so we don't have any
    expect(metadata.isNone()).toBeTruthy();
    expect(assembledData).toEqual(data.buffer);
  });

  it("Returns metadata correctly", () => {
    interface Metadata extends JsonObject {
      item1: string;
    }
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const chunker = new BinaryChunker({ onDataTimeout: jest.fn() });

    const metadata: Metadata = {
      item1: "Hello, World!",
    };

    const chunks = chunker.chunkData<Metadata>(data.buffer, metadata);

    let assembled: ReturnType<typeof chunker.receiveChunk<Metadata>> =
      option.none();

    for (const chunk of chunks) {
      assembled = chunker.receiveChunk(chunk);
      if (assembled.isSome()) {
        break;
      }
    }

    expect(assembled.isSome()).toBeTruthy();
    const { metadata: recvMetadata } = assembled.unwrap();
    expect(recvMetadata.unwrap()).toEqual(metadata);
  });

  it("Can reassemble data correctly if it is received in an incorrect order", async () => {
    interface Metadata extends JsonObject {
      item1: string;
      item2: number;
    }

    const metadata: Metadata = {
      item1: "Hello World!",
      item2: 47,
    };

    const expectedData = new Uint8Array([1, 2, 3, 4, 5]);

    const chunker = new BinaryChunker({
      onDataTimeout: jest.fn(),
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
    });

    const chunks = Array.from(
      chunker.chunkData<Metadata>(expectedData.buffer, metadata),
    );

    expect(chunks).toHaveLength(6);

    let recvOpt: ReturnType<typeof chunker.receiveChunk> = option.none();

    for (const chunk of chunks.reverse()) {
      recvOpt = chunker.receiveChunk(chunk);
      if (recvOpt.isSome()) {
        break;
      }
    }

    expect(recvOpt.isSome()).toBeTruthy();

    const { data, metadata: recvMetadata } = recvOpt.unwrap();

    expect(recvMetadata.isSome()).toBeTruthy();

    expect(data).toEqual(expectedData.buffer);
    expect(recvMetadata.unwrap()).toEqual(metadata);
  });

  it("Removes data from memory if packets are not received within the dataTimeoutMs", async () => {
    jest.useFakeTimers();
    const dataTimeoutCallback = jest.fn();
    const timeout = 100;

    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const chunker = new BinaryChunker({
      onDataTimeout: dataTimeoutCallback,
      dataTimeout: timeout,
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
    });

    const [chunk1, chunk2, chunk3] = Array.from(chunker.chunkData(data.buffer));

    const id = chunker["parseHeaderFromBuffer"](chunk1).id;

    expect(chunker.receiveChunk(chunk1).isNone()).toBeTruthy();
    jest.advanceTimersByTime(timeout - 1);
    expect(dataTimeoutCallback).not.toHaveBeenCalled();
    expect(chunker["_chunks"].size).toEqual(1);

    expect(chunker.receiveChunk(chunk2).isNone()).toBeTruthy();
    // A new chunk was received. This should reset the timeout.
    jest.advanceTimersByTime(timeout - 1);
    expect(dataTimeoutCallback).not.toHaveBeenCalled();

    expect(chunker.receiveChunk(chunk3).isNone()).toBeTruthy();
    jest.advanceTimersByTime(timeout);
    expect(dataTimeoutCallback).toHaveBeenCalledTimes(1);
    expect(dataTimeoutCallback).toHaveBeenCalledWith(id);

    // Data has timed out. We have removed the data from memory and notified the user
    // of the failed transfer.
    expect(chunker["_chunks"].size).toEqual(0);
  });
});
