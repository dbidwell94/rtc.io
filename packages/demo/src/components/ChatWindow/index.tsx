import { option } from "@dbidwell94/ts-utils";
import { useAppDispatch, useAppSelector } from "../../store";
import { cls } from "../../utils/className";
import { useMemo, useState } from "react";
import {
  addGlobalMessage,
  addMessage,
  type GlobalMessage,
  type Message,
} from "../../store/messages";
import Input from "../Input";
import IconButton from "../IconButton";
import { PaperClipIcon } from "@heroicons/react/24/outline";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { createTypedHooks } from "@rtcio/react";
import type { Events } from "../../types";
import { v4 } from "uuid";
import MessageComponent from "./Message";

export type RenderableMessage = GlobalMessage | Message;

const { usePeerEmitter, useRtc } = createTypedHooks<Events>();

export default function ChatWindow() {
  const { globalMessages, messages: userMessages } = useAppSelector(
    (state) => state.message,
  );
  const { selectedUserId } = useAppSelector((state) => state.users);
  const { emit, emitTo } = usePeerEmitter();
  const [messageText, setMessageText] = useState("");
  const dispatch = useAppDispatch();
  const { myId } = useRtc();

  const messages = useMemo(() => {
    return option
      .fromSerializableOption(selectedUserId)
      .map<RenderableMessage[]>((id) => userMessages[id] ?? [])
      .unwrapOr(globalMessages);
  }, [selectedUserId, globalMessages, userMessages]);

  return (
    <section className={cls`w-full h-full bg-gray-200 flex-1 flex flex-col`}>
      <div
        className={cls`flex-1 overflow-y-scroll overflow-x-hidden h-full flex flex-col gap-5 my-4`}
      >
        {messages.map((msg) => {
          return (
            <MessageComponent
              key={msg.id}
              message={msg}
              fromMyself={myId.map((id) => msg.fromId === id).unwrapOr(false)}
            />
          );
        })}
      </div>

      <form
        className={cls`w-full p-5 bg-gray-50 flex gap-5`}
        onSubmit={(evt) => {
          evt.preventDefault();
          if (!messageText.trim() || myId.isNone()) {
            return;
          }
          const message = {
            id: v4(),
            text: messageText,
            time: Date.now(),
          };

          if (option.isNone(selectedUserId)) {
            emit("globalMessage", message);
            dispatch(
              addGlobalMessage({
                id: message.id,
                text: message.text,
                createdAt: message.time,
                fromId: myId.value,
              }),
            );
          } else {
            emitTo(selectedUserId.value, "message", message);
            dispatch(
              addMessage({
                createdAt: message.time,
                id: message.id,
                text: message.text,
                fromId: myId.value,
                myId: myId.value,
                toId: selectedUserId.value,
              }),
            );
          }

          setMessageText("");
        }}
      >
        <IconButton icon={PaperClipIcon} label="Attach" disabled />
        <Input
          placeholder="Type a message..."
          fullWidth
          value={messageText}
          onChange={({ currentTarget: { value } }) => setMessageText(value)}
          multiline
        />
        <IconButton
          type="submit"
          icon={PaperAirplaneIcon}
          label="Send"
          className={cls`bg-blue-400 rounded-full w-10 h-10 text-center text-white flex justify-center items-center -rotate-90`}
        />
      </form>
    </section>
  );
}
