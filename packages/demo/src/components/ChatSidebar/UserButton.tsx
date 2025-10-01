import { option } from "@dbidwell94/ts-utils";
import { useAppSelector } from "../../store";
import type { User } from "../../store/user";
import { cls } from "../../utils/className";

type UserButtonProps = Omit<
  React.ComponentProps<"button">,
  "children" | "className"
> & {
  user: User;
  active?: boolean;
};

export default function UserButton({
  user,
  active,
  ...buttonProps
}: UserButtonProps) {
  const stateMessages = useAppSelector((state) => state.message.messages);

  const messages = option.unknown(stateMessages[user.id]);

  const lastMessage = messages.andThen((messages) =>
    option.unknown(messages[messages.length - 1]),
  );

  return (
    <button
      {...buttonProps}
      className={cls`py-5 px-2 border-l-8 flex items-center hover:bg-blue-200 transition-colors
                    ${active ? "border-blue-400 bg-blue-100" : "border-transparent"} cursor-pointer disabled:cursor-not-allowed
                     overflow-hidden w-full`}
    >
      <div
        className={cls`rounded-full p-1 w-8 h-8 flex items-center justify-center
                      font-serif text-xl mr-4 bg-gray-200 font-bold text-gray-600 shrink-0`}
      >
        {user.name.substring(0, 1).toUpperCase()}
      </div>
      <div className={cls`flex flex-col w-min items-start overflow-hidden`}>
        <p className={cls`font-semibold text-gray-900`}>{user.name}</p>
        <p
          className={cls`text-sm text-gray-600 overflow-ellipsis overflow-hidden whitespace-nowrap w-full`}
        >
          {lastMessage.map((msg) => msg.text).unwrapOr("No Message")}
        </p>
      </div>
    </button>
  );
}
