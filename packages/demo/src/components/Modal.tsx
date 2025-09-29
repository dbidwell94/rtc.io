import type { PropsWithChildren } from "react";
import { cls } from "../utils/className";
import { XMarkIcon } from "@heroicons/react/24/solid";
import IconButton from "./IconButton";

export type ModalProps = PropsWithChildren<{
  title: string;
  allowClose?: boolean;
}>;

export default function Modal({
  children,
  title,
  allowClose = true,
}: ModalProps) {
  return (
    <section
      className={cls`
        fixed top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2
        p-5 bg-slate-200 rounded max-h-full shadow-slate-300 shadow-xl
        overflow-y-scroll w-full md:max-w-3/4 lg:max-w-1/2
      `}
    >
      <div className={cls`flex gap-10 w-full justify-between`}>
        <h2 className={cls`font-bold text-xl`}>{title}</h2>
        <IconButton
          size={7}
          icon={XMarkIcon}
          disabled={!allowClose}
          label="Close Modal"
        />
      </div>
      <hr className={cls`mb-4 mt-2 text-slate-400`} />

      {children}
    </section>
  );
}
