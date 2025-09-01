import { renderHook } from "@testing-library/react";
import { ProviderWrapper, createMockRtc } from "../testUtils";
import { createPeerListener } from "./useSetPeerListener";
import * as rtcCore from "@rtcio/core";

describe("src/hooks/useSetPeerListener.ts", () => {
  it("subscribes to the peer listener's event one time only", async () => {
    const { rtc } = createMockRtc();
  });
});
