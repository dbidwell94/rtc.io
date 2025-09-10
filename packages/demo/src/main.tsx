import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import LocalSignaler from "@rtcio/signal-local";
import { P2PProvider } from "@rtcio/react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <P2PProvider
      roomName="Test Room"
      signaler={new LocalSignaler("Test Channel")}
    >
      <App />
    </P2PProvider>
  </StrictMode>,
);
