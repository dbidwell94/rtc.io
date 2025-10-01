import { option } from "@dbidwell94/ts-utils";
import { useAppSelector } from "../../store";
import { cls } from "../../utils/className";
import IconButton from "../IconButton";
import { PhoneIcon } from "@heroicons/react/24/outline";
import { VideoCameraIcon } from "@heroicons/react/24/outline";
import Avatar from "../Avatar";

export default function ChatHeader() {
  const { selectedUserId, users } = useAppSelector((state) => state.users);

  const headerText = option
    .fromSerializableOption(selectedUserId)
    .andThen((id) => option.unknown(users[id]?.name))
    .unwrapOr("Global Chat");

  return (
    <section
      className={cls`w-full h-17 shrink-0 bg-slate-50 flex justify-between items-center px-10 border-b border-slate-200`}
    >
      <div className={cls`flex items-center`}>
        {option.isSome(selectedUserId) && <Avatar username={headerText} />}
        <h2>{headerText}</h2>
      </div>
      <div className={cls`flex gap-5`}>
        <IconButton
          icon={PhoneIcon}
          label="Start Audio Call"
          disabled
          size={5}
        />
        <IconButton
          icon={VideoCameraIcon}
          label="Start Video Call"
          disabled
          size={5}
        />
      </div>
    </section>
  );
}
