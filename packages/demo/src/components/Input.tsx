import type { ComponentProps } from "react";
import { cls } from "../utils/className";
import type { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

export type InputProps = Omit<
  ComponentProps<"textarea"> & ComponentProps<"input">,
  "className"
> & {
  iconPrefix?: typeof MagnifyingGlassIcon;
  label?: string;
  multiline?: boolean;
  fullWidth?: boolean;
};

export default function Input({
  iconPrefix: Prefix,
  label,
  multiline = false,
  fullWidth,
  ...inputProps
}: InputProps) {
  const InputType = multiline ? "textarea" : "input";

  return (
    <div className={cls`relative flex items-center ${fullWidth && "w-full"}`}>
      {label && (
        <label htmlFor={inputProps.name} className={cls`mr-2`}>
          {label}
        </label>
      )}

      {Prefix && (
        <Prefix
          className={cls`size-5 absolute top-1/2 -translate-y-1/2 translate-x-3/4 text-gray-400`}
        />
      )}

      <InputType
        {...inputProps}
        className={cls`bg-gray-200 ${!multiline && "rounded-full"} py-2 ${Prefix ? "pl-10 pr-2" : "px-2"} border outline-0 focus:border-blue-400 transition-colors
                    w-full`}
      />
    </div>
  );
}
