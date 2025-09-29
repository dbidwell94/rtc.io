import { cls } from "../utils/className";

type ButtonProps = Omit<React.ComponentProps<"button">, "className"> & {
  buttonText: string;
  primary?: boolean;
  fullWidth?: boolean;
};

export default function Button({
  buttonText,
  primary,
  fullWidth,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      className={cls`
                  px-4 py-2 rounded-lg border-2 border-blue-500
                  ${fullWidth && "w-full"}
                  ${primary && "bg-blue-500 text-white hover:bg-blue-400 disabled:bg-slate-400 disabled:hover:bg-slate-400"}
                  hover:border-blue-400 disabled:border-slate-400 disabled:hover:border-slate-400
                  cursor-pointer disabled:cursor-not-allowed transition-colors
                    `}
    >
      {buttonText}
    </button>
  );
}
