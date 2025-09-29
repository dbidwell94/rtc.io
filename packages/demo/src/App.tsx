import { useState } from "react";
import Modal from "./components/Modal";
import { cls } from "./utils/className";
import { option } from "@dbidwell94/ts-utils";
import Button from "./components/Button";
import { P2PProvider } from "@rtcio/react";
import Chat from "./Chat";
import LocalSignalServer from "../../signalLocalBrowser/dist";
import type { ClientSignaler } from "@rtcio/signaling";
import { useAppDispatch, useAppSelector } from "./store";
import Input from "./components/Input";
import { setMyName } from "./store/user";

const DemoType = {
  LocalOnly: "LocalOnly",
  Global: "Global",
} as const;

export type DemoTypeValue = (typeof DemoType)[keyof typeof DemoType];

export default function App() {
  const [demoType, setDemoType] = useState(option.none<DemoTypeValue>());
  const dispatch = useAppDispatch();
  const { myName } = useAppSelector((state) => state.users);

  if (demoType.isNone()) {
    return (
      <div className="bg-slate-100 w-lvw h-lvh">
        <Modal title="Welcome to the @rtcio demo!" allowClose={false}>
          <h2 className={cls`mb-4`}>
            Experiment with <code className="bg-slate-300">@rtcio/core</code>{" "}
            and <code className="bg-slate-300">@rtcio/react</code> using two
            different signaling methods:
          </h2>

          <ul className={cls`list-disc list-inside`}>
            <li>
              Local Demo
              <ul className={cls`list-disc ml-8`}>
                <li>
                  Uses a <code className="bg-slate-300">BroadcastChannel</code>{" "}
                  to connect peers in different tabs of the same browser.
                  Perfect for quick, local tests without needing an external
                  server.
                </li>
              </ul>
            </li>
            <li>
              Global Demo
              <ul className={cls`list-disc ml-8`}>
                <li>
                  Uses a <code className="bg-slate-300">Socket.IO</code> server
                  to connect with users on different computers across the
                  internet.
                </li>
              </ul>
            </li>
          </ul>

          <h2 className={cls`mt-4`}>
            <strong>Please note:</strong> This demo does not use TURN servers.
            If your network has certain restrictions (like a symmetric NAT), the{" "}
            <strong>Global Demo</strong> may fail to connect.
          </h2>

          <section className={cls`flex w-full justify-around mt-4`}>
            <Button
              buttonText="Try Local"
              primary
              onClick={() => setDemoType(option.some(DemoType.LocalOnly))}
            />
            <Button
              buttonText="Try Global"
              primary
              disabled
              onClick={() => setDemoType(option.some(DemoType.Global))}
            />
          </section>
        </Modal>
      </div>
    );
  } else if (option.isNone(myName)) {
    return (
      <Modal title="Create Temporary User">
        <p>Please enter in your desired Username for this chat session.</p>
        <form
          className={cls`flex mt-5 flex-col gap-5 items-center`}
          onSubmit={(evt) => {
            evt.preventDefault();
            const data = new FormData(evt.currentTarget);
            if (data.get("userName")) {
              dispatch(setMyName(String(data.get("userName")!)));
            }
          }}
        >
          <div className={cls`flex w-full justify-around gap-5`}>
            <Input name="userName" label="Username" placeholder="Dudeperson" />
          </div>
          <div>
            <Button buttonText="Submit" primary />
          </div>
        </form>
      </Modal>
    );
  } else {
    const demoTypeValue = demoType.value;
    return (
      <P2PProvider
        roomName="rtcio"
        maxChunkSizeBytes={64 * 1_000}
        signaler={
          demoTypeValue === DemoType.LocalOnly
            ? new LocalSignalServer()
            : (null as unknown as ClientSignaler)
        }
      >
        <div className={cls`w-lvw h-lvh`}>
          <Chat />
        </div>
      </P2PProvider>
    );
  }
}
