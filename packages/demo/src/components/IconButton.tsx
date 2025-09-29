import type { ComponentProps } from "react";
import { cls } from "../utils/className";
import type { XMarkIcon } from "@heroicons/react/24/solid";

export type IconButtonProps = Omit<ComponentProps<"button">, "className"> & {
  size?: number;
  icon: typeof XMarkIcon;
  label: string;
};

export default function IconButton({
  size = 7,
  icon: Icon,
  label,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={cls`
              text-slate-700 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed
              not-disabled:hover:text-slate-500 transition-colors`}
    >
      <Icon
        style={{
          width: `calc(var(--spacing) * ${size})`,
          height: `calc(var(--spacing) * ${size})`,
        }}
      />
    </button>
  );
}
