import { FileMetadata } from ".";
import { BinaryChunker, JsonObject } from "./binaryData";
import waitFor from "wait-for-expect";

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

  it("Returns a ReadableStream when set to a streaming data type", async () => {
    const fileData = new Uint8Array([1, 2, 3, 4, 5]);

    const expectedMetadata: FileMetadata = {
      _internalIsFile: true,
      lastModified: 123,
      name: "Custom Name",
      size: fileData.byteLength,
      type: "binary",
    };

    const chunker = new BinaryChunker({
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
      onDataTimeout: jest.fn(),
    });

    const chunks = Array.from(
      chunker.chunkData<FileMetadata>(fileData.buffer, expectedMetadata),
    );

    let id: string;
    {
      const { metadata, id: fileId } = chunker.receiveChunk(chunks.shift()!);
      id = fileId;
      expect(metadata.isSome()).toBeTruthy();
      expect(metadata.unwrap()).toEqual(expectedMetadata);
    }

    expect(id).toEqual(expect.any(String));

    const streamRes = chunker.setDataIsStream(id);
    expect(streamRes.isOk()).toBeTruthy();

    const stream = streamRes.unwrap();

    expect(stream.locked).toBeFalsy();

    const reader = stream.getReader();

    for (const chunk of chunks) {
      chunker.receiveChunk(chunk);
    }

    const recvChunks: number[] = [];

    let done = false;
    while (!done) {
      const readResult = await reader.read();
      if (readResult.done) {
        done = true;
        break;
      }
      recvChunks.push(...readResult.value);
    }

    expect(new Uint8Array(recvChunks)).toEqual(fileData);
  });

  it("Can reassemble a stream if chunks are sent out of order", async () => {
    const onTimeout = jest.fn();
    const fileData = new Uint8Array([1, 2, 3, 4, 5, 6]);

    const metadata: FileMetadata = {
      _internalIsFile: true,
      lastModified: 123,
      name: "TEST FILE",
      size: fileData.byteLength,
      type: "bytes",
    };

    const chunker = new BinaryChunker({
      onDataTimeout: onTimeout,
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
    });

    const chunks = Array.from(chunker.chunkData(fileData.buffer, metadata));

    // reverse the elements to simulate an out-of-order sender
    chunks.reverse();

    // Send the metadata first. This simulates the P2PConnection class
    // getting the metadata and checking if it is a file to set the
    // stream type
    const { id } = chunker.receiveChunk(chunks.pop()!);

    expect(chunker["_chunks"].size).toEqual(1);

    const streamRes = chunker.setDataIsStream(id);

    await waitFor(() => {
      expect(chunker["_chunks"].size).toEqual(0);
      expect(chunker["_streams"].size).toEqual(1);
    });

    expect(streamRes.isOk()).toBeTruthy();
    const stream = streamRes.unwrap();

    for (const chunk of chunks) {
      expect(chunker.receiveChunk(chunk).isStream).toBeTruthy();
    }

    const reader = stream.getReader();
    const assembled: number[] = [];
    while (true) {
      const res = await reader.read();
      if (res.done) {
        break;
      }

      assembled.push(...res.value);
    }

    expect(new Uint8Array(assembled)).toEqual(fileData);
    expect(chunker["_streams"].size).toEqual(0);
    expect(chunker["_chunks"].size).toEqual(0);
  });

  it("Accepts a ReadableStream when generating chunks", async () => {
    interface Metadata extends JsonObject {
      testName: string;
    }
    const metadata: Metadata = {
      testName: "HELLO WORLD",
    };
    const fileData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const file = new File([fileData], "test.txt");
    const fileStream = file.stream();

    const chunker = new BinaryChunker({
      maxChunkSize: BinaryChunker.HEADER_SIZE + 1,
      onDataTimeout: jest.fn(),
    });

    const chunks: ArrayBuffer[] = [];
    for await (const chunk of chunker.streamData(fileStream, metadata)) {
      chunks.push(chunk);
    }

    const finalChunk = chunks[chunks.length - 1];
    expect(chunker["parseHeaderFromBuffer"](finalChunk).isFinal).toBeTruthy();

    // 10 bytes + 1 metadata header + one final chunk with only a header
    // to signal that we have closed the stream
    expect(chunks).toHaveLength(12);

    let assembled = chunker.receiveChunk<Metadata>(chunks.pop()!);
    for (const chunk of chunks) {
      assembled = chunker.receiveChunk(chunk);
    }

    expect(assembled.data.isSome()).toBeTruthy();
    expect(assembled.data.unwrap()).toEqual(fileData.buffer);
    expect(assembled.metadata.isSome()).toBeTruthy();
    expect(assembled.metadata.unwrap()).toEqual(metadata);
  });

  it("Correctly generates chunks from a ReadableStream with an odd chunkSize according to the buffer length", async () => {
    interface Metadata extends JsonObject {
      someString: string;
    }
    const metadata: Metadata = {
      someString: "HELLO WORLD!",
    };
    const fileData = new Uint8Array([1, 2, 3, 4, 5]);
    const file = new File([fileData], "text.txt");
    const fileStream = file.stream();

    const chunker = new BinaryChunker({
      maxChunkSize: BinaryChunker.HEADER_SIZE + 2,
      onDataTimeout: jest.fn(),
    });

    const chunks: ArrayBuffer[] = [];

    for await (const chunk of chunker.streamData(fileStream, metadata)) {
      chunks.push(chunk);
    }

    // 1 metadata chunk and 3 data chunks
    expect(chunks).toHaveLength(4);
    expect(
      chunker["parseHeaderFromBuffer"](chunks[chunks.length - 1]).isFinal,
    ).toBeTruthy();

    let assembled = chunker.receiveChunk<Metadata>(chunks.pop()!);
    for (const chunk of chunks) {
      assembled = chunker.receiveChunk(chunk);
    }

    expect(assembled.data.isSome()).toBeTruthy();
    expect(assembled.data.unwrap()).toEqual(fileData.buffer);
    expect(assembled.metadata.isSome()).toBeTruthy();
    expect(assembled.metadata.unwrap()).toEqual(metadata);
  });
});
