import { renderHook, waitFor } from "@testing-library/react";
import { useOnIncomingConnection } from "./useOnIncomingConnection";
import { ProviderWrapper, createMockRtc } from "../testUtils";

describe("src/hooks/useOnIncomingConnection.ts", () => {
  it("subscribes to the global RTC provider's connection event", async () => {
    const { onSpy } = createMockRtc();

    const onConnectionCallback = () => {};

    renderHook(() => useOnIncomingConnection(onConnectionCallback), {
      wrapper: ProviderWrapper,
    });

    await waitFor(() => {
      // The Provider subscribes to this call as well
      expect(onSpy).toHaveBeenCalledTimes(2);
      expect(onSpy).toHaveBeenCalledWith(
        "connectionRequest",
        onConnectionCallback,
      );
    });
  });
});
