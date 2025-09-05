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

    let finalChunk = chunker.receiveChunk(chunks.pop()!);
    for (const chunk of chunks) {
      finalChunk = chunker.receiveChunk(chunk);
      if (finalChunk.data.isSome()) {
        break;
      }
    }

    expect(finalChunk.data.isSome()).toBeTruthy();
    const { data: assembledData, metadata } = finalChunk;

    // we didn't pass any metadata in, so we don't have any
    expect(metadata.isNone()).toBeTruthy();
    expect(assembledData.unwrap()).toEqual(data.buffer);
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

    const chunks = Array.from(
      chunker.chunkData<Metadata>(data.buffer, metadata),
    );

    let assembled = chunker.receiveChunk(chunks.pop()!);

    for (const chunk of chunks) {
      assembled = chunker.receiveChunk(chunk);
      if (assembled.data.isSome()) {
        break;
      }
    }

    expect(assembled.data.isSome()).toBeTruthy();
    expect(assembled.metadata.unwrap()).toEqual(metadata);
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

    let recvOpt = chunker.receiveChunk(chunks.pop()!);

    for (const chunk of chunks.reverse()) {
      recvOpt = chunker.receiveChunk(chunk);
      if (recvOpt.data.isSome()) {
        break;
      }
    }

    expect(recvOpt.data.isSome()).toBeTruthy();

    const { data, metadata: recvMetadata } = recvOpt;

    expect(recvMetadata.isSome()).toBeTruthy();

    expect(data.unwrap()).toEqual(expectedData.buffer);
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

    expect(chunker.receiveChunk(chunk1).data.isNone()).toBeTruthy();
    jest.advanceTimersByTime(timeout - 1);
    expect(dataTimeoutCallback).not.toHaveBeenCalled();
    expect(chunker["_chunks"].size).toEqual(1);

    expect(chunker.receiveChunk(chunk2).data.isNone()).toBeTruthy();
    // A new chunk was received. This should reset the timeout.
    jest.advanceTimersByTime(timeout - 1);
    expect(dataTimeoutCallback).not.toHaveBeenCalled();

    expect(chunker.receiveChunk(chunk3).data.isNone()).toBeTruthy();
    jest.advanceTimersByTime(timeout);
    expect(dataTimeoutCallback).toHaveBeenCalledTimes(1);
    expect(dataTimeoutCallback).toHaveBeenCalledWith(id);

    // Data has timed out. We have removed the data from memory and notified the user
    // of the failed transfer.
    expect(chunker["_chunks"].size).toEqual(0);
  });

  it("Can handle packets from different ids without 'crossing streams'", async () => {
    const expected1 = new Uint8Array([6, 7, 8, 9, 0]);
    const expected2 = new Uint8Array([1, 2, 3, 4, 5]);

    const chunker = new BinaryChunker({ onDataTimeout: jest.fn() });

    const chunks1 = Array.from(chunker.chunkData(expected1.buffer));
    const chunks2 = Array.from(chunker.chunkData(expected2.buffer));

    const chunks: ArrayBuffer[] = [];
    for (let i = 0; i < chunks1.length; i++) {
      chunks.push(chunks1[i]);
      chunks.push(chunks2[i]);
    }

    expect(chunks).toHaveLength(chunks1.length + chunks2.length);

    const assembled: Array<ReturnType<typeof chunker.receiveChunk>> = [];

    for (const chunk of chunks) {
      const res = chunker.receiveChunk(chunk);

      if (res.data.isSome()) {
        assembled.push(res);
      }
    }

    expect(assembled).toHaveLength(2);

    expect([assembled[0].data.unwrap(), assembled[1].data.unwrap()]).toEqual(
      expect.arrayContaining([expected1.buffer, expected2.buffer]),
    );
  });
});
