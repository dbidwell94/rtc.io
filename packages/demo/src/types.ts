import type { PeerId } from "@rtcio/react";

export type UserStatus = "online" | "idle" | "dnd" | "offline";

export interface User {
  id: PeerId;
  name: string;
  status: UserStatus;
}

export interface Message {
  id: string;
  text: string;
  time: number;
}

export interface Events {
  message: (message: Message) => void;
  globalMessage: (message: Message) => void;
  /**
   * Called every X milliseconds to notify remote peer that typing is still occurring
   */
  typing: () => void;
  /**
   * Called when a remote peer looks at a message.
   */
  lookedAt: (messageId: string) => void;
  /**
   * Called when a client connects. Sends client information to the remote peer.
   */
  hello: (username: string) => void;
}
