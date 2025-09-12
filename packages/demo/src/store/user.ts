import { option, type SerializableOption } from "@dbidwell94/ts-utils";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export enum UserStatus {
  Online,
  Offline,
}

interface User {
  id: string;
  name: string;
  connectedAt: number;
  status: UserStatus;
}

interface UserState {
  users: Record<string, User>;
  myId: SerializableOption<string>;
}

const initialState: UserState = {
  users: Object.create(null),
  myId: option.none<string>().serialize(),
};

export const userSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    addUser: (state, action: PayloadAction<User>) => {
      state.users[action.payload.id] = action.payload;
    },
    removeUser: (state, action: PayloadAction<string>) => {
      delete state.users[action.payload];
    },
    setUserStatus: (
      state,
      action: PayloadAction<{ userId: string; status: UserStatus }>,
    ) => {
      if (state.users[action.payload.userId]) {
        state.users[action.payload.userId]!.status = action.payload.status;
      }
    },
    setId: (state, newId: PayloadAction<string>) => {
      state.myId = option.some(newId.payload).serialize();
    },
  },
});

export const {
  addUser,
  removeUser,
  setId: setMyId,
  setUserStatus,
} = userSlice.actions;
