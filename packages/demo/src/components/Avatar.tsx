import { cls } from "../utils/className";

type AvatarProps = {
  username: string;
};

export default function Avatar({ username }: AvatarProps) {
  return (
    <div
      className={cls`rounded-full p-1 w-8 h-8 flex items-center justify-center
                      font-serif text-xl mr-4 bg-gray-200 font-bold text-gray-600 shrink-0`}
    >
      {username.substring(0, 1).toUpperCase()}
    </div>
  );
}
