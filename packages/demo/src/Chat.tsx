import { createTypedHooks } from "@rtcio/react";
import ChatHeader from "./components/ChatHeader";
import ChatSidebar from "./components/ChatSidebar";
import { cls } from "./utils/className";
import { useAppDispatch } from "./store";
import { addUser, UserStatus } from "./store/user";
import { option } from "@dbidwell94/ts-utils";

const { useRtcListener, useRtc } = createTypedHooks();

export default function Chat() {
  const { rtc } = useRtc();
  const dispatch = useAppDispatch();

  useRtcListener("connectionRequest", (req) => {
    req.accept();
  });

  useRtcListener("signalPeerConnected", (peerId) => {
    rtc.inspect((val) => {
      val.connectToPeer(peerId);
    });
  });

  useRtcListener("connected", (peer) => {
    dispatch(
      addUser({
        connectedAt: new Date().getTime(),
        id: peer.id,
        name: peer.id,
        publicKey: option.none<string>().serialize(),
        status: UserStatus.Online,
      }),
    );
  });

  return (
    <div className={cls`flex flex-row h-full w-full`}>
      <ChatSidebar />
      <div className={cls`flex h-full w-full flex-1`}>
        <ChatHeader />
      </div>
    </div>
  );
}
