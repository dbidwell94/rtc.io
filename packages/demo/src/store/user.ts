import { option, type SerializableOption } from "@dbidwell94/ts-utils";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export enum UserStatus {
  Online,
  Offline,
}

export interface User {
  id: string;
  name: string;
  connectedAt: number;
  status: UserStatus;
}

interface UserState {
  users: Record<string, User>;
  myId: SerializableOption<string>;
  myName: SerializableOption<string>;
  selectedUserId: SerializableOption<string>;
}

const initialState: UserState = {
  users: Object.create(null),
  myId: option.none<string>().serialize(),
  myName: option.unknown(localStorage.getItem("myName")).serialize(),
  selectedUserId: option.none<string>().serialize(),
};

export interface CreateKeyPairOptions {
  name: string;
}

export const userSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    setSelectedUserId: (
      state,
      action: PayloadAction<SerializableOption<string>>,
    ) => {
      state.selectedUserId = action.payload;
    },

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
    setMyName: (state, myName: PayloadAction<string>) => {
      state.myName = option.some(myName.payload).serialize();
      localStorage.setItem("myName", myName.payload);
    },
  },
});

export const {
  addUser,
  removeUser,
  setId: setMyId,
  setMyName,
  setUserStatus,
  setSelectedUserId,
} = userSlice.actions;
