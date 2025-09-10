import { usePeerContext } from "./usePeerContext";

export function useSignalPeers() {
  const ctx = usePeerContext();
  if (!ctx) {
    throw new Error("useSignalPeers must be called in a P2PProvider");
  }

  return ctx.signalerPeers;
}
