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

  it("Sets headers on the chunks as expected", () => {});
});
