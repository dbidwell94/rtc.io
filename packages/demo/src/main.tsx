import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LocalSignaler from "@rtcio/signal-local";
import { P2PProvider } from "@rtcio/react";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <P2PProvider
      roomName="Test Room"
      signaler={new LocalSignaler("Test Channel")}
      dataTimeoutMs={5000}
      maxChunkSizeBytes={1024 * 4}
    >
      <App />
    </P2PProvider>
  </StrictMode>,
);
