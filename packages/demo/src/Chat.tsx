import { createTypedHooks } from "@rtcio/react";
import ChatSidebar from "./components/ChatSidebar";
import { cls } from "./utils/className";
import { useAppDispatch, useAppSelector } from "./store";
import { addUser, UserStatus } from "./store/user";
import type { Events } from "./types";
import { option } from "@dbidwell94/ts-utils";
import ChatWindow from "./components/ChatWindow";
import { addGlobalMessage, addMessage } from "./store/messages";

const { useRtcListener, useRtc, usePeerListener } = createTypedHooks<Events>();

export default function Chat() {
  const { rtc, myId } = useRtc();
  const dispatch = useAppDispatch();
  const { myName, users } = useAppSelector((state) => state.users);

  useRtcListener("connectionRequest", (req) => {
    req.accept();
  });

  useRtcListener("signalPeerConnected", (peerId) => {
    console.log("SignalPeerConnected");
    rtc.inspect((val) => {
      val.connectToPeer(peerId);
    });
  });

  useRtcListener("connected", (peer) => {
    peer.emit(
      "hello",
      option.fromSerializableOption(myName).unwrapOr("RemotePeer"),
    );
    dispatch(
      addUser({
        connectedAt: new Date().getTime(),
        id: peer.id,
        name: peer.id,
        status: UserStatus.Online,
      }),
    );
  });

  usePeerListener("hello", (peerId, username) => {
    const user = option.unknown(users[peerId]);

    user.inspect((user) => {
      dispatch(
        addUser({
          ...user,
          name: username,
        }),
      );
    });
  });

  usePeerListener("globalMessage", (peerId, message) => {
    dispatch(
      addGlobalMessage({
        createdAt: message.time,
        fromId: peerId,
        id: message.id,
        text: message.text,
      }),
    );
  });

  usePeerListener("message", (peerId, message) => {
    myId.inspect((id) => {
      dispatch(
        addMessage({
          createdAt: message.time,
          fromId: peerId,
          id: message.id,
          text: message.text,
          myId: id,
          toId: id,
        }),
      );
    });
  });

  return (
    <div className={cls`flex flex-row h-full w-full`}>
      <ChatSidebar />
      <div className={cls`flex h-full w-full flex-col overflow-hidden`}>
        <ChatWindow />
      </div>
    </div>
  );
}
