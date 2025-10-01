import type { RenderableMessage } from ".";
import { cls } from "../../utils/className";

type MessageProps = {
  message: RenderableMessage;
  fromMyself: boolean;
};

export default function Message({ message, fromMyself }: MessageProps) {
  return (
    <div
      className={cls`${fromMyself ? "self-end" : "self-start"} flex max-w-1/2 flex-col`}
    >
      <p
        className={cls`${fromMyself ? "bg-blue-500 self-end text-white rounded-tr-none" : "bg-gray-400 rounded-tl-none"} p-3 mx-5 rounded-lg
                      break-words`}
      >
        {message.text}
      </p>
      <small className={cls`${fromMyself ? "self-end" : "self-start"} mx-5`}>
        {new Date(message.createdAt).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "numeric",
        })}
      </small>
    </div>
  );
}
