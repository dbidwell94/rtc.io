import { useAppDispatch, useAppSelector } from "../../store";
import { cls } from "../../utils/className";
import UserButton from "./UserButton";
import IconButton from "../IconButton";
import { PencilSquareIcon } from "@heroicons/react/24/solid";
import Input from "../Input";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Button from "../Button";
import { setSelectedUserId } from "../../store/user";
import { option } from "@dbidwell94/ts-utils";

export default function ChatSidebar() {
  const { users: usersObj, selectedUserId } = useAppSelector(
    (state) => state.users,
  );
  const dispatch = useAppDispatch();

  const users = Object.values(usersObj);

  return (
    <section
      className={cls`max-w-60 bg-slate-50 h-full border-r border-slate-200 flex flex-col`}
    >
      <div
        className={cls`border-b border-slate-200 px-4 py-5 flex justify-between mb-4`}
      >
        <h2 className={cls`font-bold text-xl text-gray-900`}>Chats</h2>
        <IconButton label="Create Chat" icon={PencilSquareIcon} size={6} />
      </div>

      <div className={cls`px-4 mb-2`}>
        <Input
          iconPrefix={MagnifyingGlassIcon}
          placeholder="Search Conversations..."
        />
      </div>

      <Button
        buttonText="Global Chat"
        onClick={() =>
          dispatch(setSelectedUserId(option.none<string>().serialize()))
        }
      />
      <div className={cls`flex w-full flex-col gap-4 mt-4`}>
        {users.map((user) => {
          return (
            <UserButton
              key={user.id}
              user={user}
              active={option
                .fromSerializableOption(selectedUserId)
                .map((val) => val === user.id)
                .unwrapOr(false)}
              onClick={() => {
                dispatch(setSelectedUserId(option.some(user.id).serialize()));
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
