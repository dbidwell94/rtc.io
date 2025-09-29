import { useAppSelector } from "../../store";
import { cls } from "../../utils/className";
import UserButton from "./UserButton";
import IconButton from "../IconButton";
import { PencilSquareIcon } from "@heroicons/react/24/solid";
import Input from "../Input";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Button from "../Button";

export default function ChatSidebar() {
  const usersObj = useAppSelector((state) => state.users.users);

  const users = Object.values(usersObj);

  console.log(users);

  return (
    <section
      className={cls`min-w-56 bg-slate-50 h-full border-r border-slate-200 flex flex-col`}
    >
      <div
        className={cls`border-b border-slate-200 px-4 py-5 flex justify-between mb-4`}
      >
        <h2 className={cls`font-bold text-xl text-gray-900`}>Chats</h2>
        <IconButton label="Create Chat" icon={PencilSquareIcon} size={6} />
      </div>

      <div className={cls`px-4 mb-4`}>
        <Input
          iconPrefix={MagnifyingGlassIcon}
          placeholder="Search Conversations..."
        />
      </div>

      <Button buttonText="Global Chat" />

      {users.map((user) => {
        return <UserButton key={user.id} user={user} />;
      })}
    </section>
  );
}
