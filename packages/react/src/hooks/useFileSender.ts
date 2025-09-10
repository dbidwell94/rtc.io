import { PeerId } from "@rtcio/core";
import { usePeerContext } from "./usePeerContext";
import { Result, result } from "@dbidwell94/ts-utils";

export function useFileSender() {
  const ctx = usePeerContext();
  if (!ctx) {
    throw new Error("useFileSender must be called in a P2PProvider");
  }
  const { peers } = ctx;

  return async function sendFile(
    toPeer: PeerId,
    file: File,
  ): Promise<Result<void>> {
    if (!peers.current.has(toPeer)) {
      return result.err(`Peer with id ${toPeer} not found`);
    }
    const connection = peers.current.get(toPeer)!;

    return connection.sendFile(file);
  };
}
