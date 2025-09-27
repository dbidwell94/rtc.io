import {
  option,
  type Option,
  type SerializableOption,
} from "@dbidwell94/ts-utils";
import {
  createSlice,
  type PayloadAction,
  createAsyncThunk,
} from "@reduxjs/toolkit";
import { generateKey, readKey } from "openpgp/lightweight";

export enum UserStatus {
  Online,
  Offline,
}

interface User {
  id: string;
  name: string;
  connectedAt: number;
  status: UserStatus;
  publicKey: SerializableOption<string>;
}

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

interface UserState {
  users: Record<string, User>;
  myId: SerializableOption<string>;
  keyPair: SerializableOption<KeyPair>;
  myName: SerializableOption<string>;
}

const initialState: UserState = {
  users: Object.create(null),
  myId: option.none<string>().serialize(),
  keyPair: option
    .unknown(localStorage.getItem("keyPair"))
    .andThen((pair) => {
      try {
        return option.some<KeyPair>(JSON.parse(pair));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        return option.none<KeyPair>();
      }
    })
    .serialize(),
  myName: option.unknown(localStorage.getItem("myName")).serialize(),
};

export interface CreateKeyPairOptions {
  name: string;
  email: Option<string>;
}

export const createKeyPair = createAsyncThunk(
  "users/createKeyPair",
  async ({ email, name }: CreateKeyPairOptions) => {
    const { privateKey, publicKey } = await generateKey({
      userIDs: [
        {
          name,
          email: email.unsafeUnwrapOr(undefined) as string | undefined,
        },
      ],
      format: "armored",
    });

    return { privateKey, publicKey, name };
  },
);

export const setKeyForUser = createAsyncThunk(
  "users/setKeyForUser",
  async ({ key, userId }: { key: string; userId: string }) => {
    const publicKey = await readKey({ armoredKey: key });

    const userName = option
      .unknown(publicKey.getUserIDs()[0])
      .map((name) => name.split(" ")[0])
      .serialize();

    return { key, userId, userName };
  },
);

export const userSlice = createSlice({
  name: "users",
  initialState,
  extraReducers: (builder) => {
    builder.addCase(createKeyPair.fulfilled, (state, action) => {
      localStorage.setItem("keyPair", JSON.stringify(action.payload));
      localStorage.setItem("myName", action.payload.name);

      state.keyPair = option
        .some({
          privateKey: action.payload.privateKey,
          publicKey: action.payload.publicKey,
        })
        .serialize();

      state.myName = option.unknown(action.payload.name).serialize();
    });

    builder.addCase(
      setKeyForUser.fulfilled,
      (state, { payload: { key, userId, userName } }) => {
        if (state.users[userId]) {
          state.users[userId]!.publicKey = option.some(key).serialize();
          if (option.isSome(userName)) {
            state.users[userId]!.name = userName.value;
          }
        }
      },
    );
  },
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
