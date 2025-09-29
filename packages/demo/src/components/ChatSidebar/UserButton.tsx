import type { User } from "../../store/user";

type UserButtonProps = Omit<
  React.ComponentProps<"button">,
  "children" | "className"
> & {
  user: User;
};

export default function UserButton({ user, ...buttonProps }: UserButtonProps) {
  return <button {...buttonProps}>{user.name.substring(0, 6)}</button>;
}
