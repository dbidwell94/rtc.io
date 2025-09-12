import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type Message = {
  id: string;
  text: string;
  fromId: string;
  toId: string;
  createdAt: number;
};

interface MessageSlice {
  messages: Record<string, Message[]>;
}

const initialState: MessageSlice = {
  messages: {},
};

export const messageSlice = createSlice({
  name: "message",
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<Message & { myId: string }>) => {
      const myId = action.payload.myId;
      // @ts-expect-error We already pulled out the id. The `Message` interface
      // doesn't need it.
      delete action.payload["myId"];

      const iSentMessage = action.payload.fromId === myId;
      const indexer = iSentMessage
        ? action.payload.toId
        : action.payload.fromId;

      if (!state.messages[indexer]) {
        state.messages[indexer] = [action.payload];
      } else {
        state.messages[indexer]!.push(action.payload);
      }
    },
  },
});

export const {
  actions: { addMessage },
  reducer,
} = messageSlice;
