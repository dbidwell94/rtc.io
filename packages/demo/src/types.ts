import type { PeerId } from "@rtcio/react";

export type UserStatus = "online" | "idle" | "dnd" | "offline";

export interface User {
  id: PeerId;
  name: string;
  status: UserStatus;
}

export interface Message {
  user: string;
  text: string;
  time: number;
  avatar: string;
}

export interface Events {
  message: (message: Message) => void;
}
