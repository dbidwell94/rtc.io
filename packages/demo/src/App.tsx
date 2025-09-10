import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import { createTypedHooks } from "@rtcio/react";
import "./App.css";

interface Events {
  countChanged: (newCount: number) => void;
}

const { usePeerEmitter, usePeerListener, useRtcListener, usePeers, useRtc } =
  createTypedHooks<Events>();

function App() {
  const [count, setCount] = useState(0);
  const rtc = useRtc();
  usePeerListener("countChanged", (newCount) => setCount(newCount));
  useRtcListener("connectionRequest", (req) => req.accept());
  useRtcListener("signalPeerConnected", (newPeer) => {
    rtc.inspect((manager) => manager.connectToPeer(newPeer));
  });
  const emitEvent = usePeerEmitter();
  const peers = usePeers();

  useEffect(() => {
    for (const peerId of Object.keys(peers)) {
      emitEvent(peerId, "countChanged", count);
    }
  }, [count, emitEvent, peers]);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
