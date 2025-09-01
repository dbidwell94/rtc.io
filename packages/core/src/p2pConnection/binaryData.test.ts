import { BinaryChunker } from "./binaryData";

describe("src/p2pConnection/binaryData.ts", () => {
  it("Throws an error if you try to create an instance with too low a chunk size", () => {
    expect(() => new BinaryChunker(1)).toThrow();
  });

  it("Does not throw an error if the max chunk size is greater than the header size", () => {
    expect(
      () => new BinaryChunker(BinaryChunker.HEADER_SIZE + 1),
    ).not.toThrow();
  });

  it("Returns the correct amount of chunks", () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
    const chunker = new BinaryChunker(BinaryChunker.HEADER_SIZE + 1);
    const data = chunker.chunkData(binaryData);

    expect(data).toHaveLength(6);
  });

  it("Sets headers on the chunks as expected", () => {
    const binaryData = new Uint8Array([1, 2]).buffer;
    const chunker = new BinaryChunker(BinaryChunker.HEADER_SIZE + 1);
    const [data, data2] = chunker.chunkData(binaryData);

    // this is a workaround to allow the calling of private methods in a class
    const header1 = chunker["parseHeaderFromBuffer"](data);
    const header2 = chunker["parseHeaderFromBuffer"](data2);

    expect(header1).toEqual({
      chunkIndex: 0,
      id: expect.any(String),
      isFinal: false,
    });
    expect(header1.id).toHaveLength(32);

    expect(header2).toEqual({
      chunkIndex: 1,
      id: expect.any(String),
      isFinal: true,
    });

    expect(header1.id).toEqual(header2.id);
  });

  it.each([
    [BinaryChunker.HEADER_SIZE + 1, new Uint8Array([1]).buffer],
    [BinaryChunker.HEADER_SIZE + 2, new Uint8Array([1, 2]).buffer],
  ])("Should be an expected size of %s bytes", (expectedBufferSize, buffer) => {
    const chunker = new BinaryChunker();
    const [data] = chunker.chunkData(buffer);

    expect(data.byteLength).toEqual(expectedBufferSize);
  });
});
