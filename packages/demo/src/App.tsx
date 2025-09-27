import { CssBaseline, Box, ThemeProvider, createTheme } from "@mui/material";
import { useState } from "react";
import ChatArea from "./components/ChatArea";
import UsersPanel from "./components/UserPanel";
import type { Events } from "./types";
import { createTypedHooks } from "@rtcio/react";
import { option, type Option } from "@dbidwell94/ts-utils";
import { useAppDispatch, useAppSelector } from "./store";
import { addMessage } from "./store/messages";
import {
  addUser,
  setKeyForUser,
  setUserStatus,
  UserStatus,
} from "./store/user";
import {
  decrypt,
  PrivateKey,
  readKey,
  readMessage,
  type Key,
} from "openpgp/lightweight";
import PromptForEncryption from "./components/PromptForEncryption";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#7289da",
    },
    background: {
      paper: "#2f3136", // Main content area
      default: "#202225", // Deepest background
    },
    text: {
      primary: "#dcddde",
      secondary: "#b9bbbe",
    },
  },
  typography: {
    fontFamily: '"Whitney", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
});

const { useRtcListener, usePeerListener, useRtc } = createTypedHooks<Events>();

export default function App() {
  const dispatch = useAppDispatch();
  const myKeyPair = useAppSelector((state) => state.users.keyPair);

  const [selectedUser, setSelectedUser] = useState<Option<string>>(
    option.none(),
  );
  const [myEncryptionKey, setMyEncryptionKey] = useState(option.none<Key>());

  const { rtc, myId } = useRtc();

  useRtcListener("connectionRequest", (req) => req.accept());
  useRtcListener("connected", (peer) => {
    dispatch(
      addUser({
        status: UserStatus.Online,
        connectedAt: new Date().getTime(),
        id: peer.id,
        name: peer.id,
        publicKey: option.none<string>().serialize(),
      }),
    );
    if (option.isSome(myKeyPair)) {
      peer.emit("publicKey", myKeyPair.value.publicKey);
    }
  });
  useRtcListener("signalPeerConnected", (peerId) => {
    rtc.inspect((val) => val.connectToPeer(peerId));
  });

  usePeerListener("connectionClosed", (peerId) => {
    dispatch(setUserStatus({ status: UserStatus.Offline, userId: peerId }));
  });
  usePeerListener("message", async (peerId, message, isEncrypted) => {
    if (rtc.isNone() || myId.isNone()) return;

    let messageThunk: ReturnType<typeof addMessage>;

    if (isEncrypted && option.isSome(myKeyPair)) {
      let key;
      if (myEncryptionKey.isNone()) {
        key = await readKey({ armoredKey: myKeyPair.value.privateKey });
        setMyEncryptionKey(option.some(key));
      } else {
        key = myEncryptionKey.value;
      }

      const encryptedMessage = await readMessage({
        armoredMessage: message.text,
      });

      const { data } = await decrypt({
        message: encryptedMessage,
        decryptionKeys: key as PrivateKey,
      });

      messageThunk = addMessage({
        myId: myId.value,
        createdAt: message.time,
        fromId: peerId,
        toId: myId.value,
        id: message.id,
        text: data,
      });
    } else {
      messageThunk = addMessage({
        myId: myId.value,
        createdAt: message.time,
        fromId: peerId,
        toId: myId.value,
        id: message.id,
        text: message.text,
      });
    }

    dispatch(messageThunk);
  });

  usePeerListener("publicKey", (peerId, publicKey) => {
    dispatch(setKeyForUser({ key: publicKey, userId: peerId }));
  });

  const handleUserSelect = (userId: string) => {
    setSelectedUser(option.some(userId));
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <PromptForEncryption />
      <Box
        sx={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
        }}
      >
        <UsersPanel
          selectedUser={selectedUser}
          onUserSelect={handleUserSelect}
        />
        <ChatArea user={selectedUser} />
      </Box>
    </ThemeProvider>
  );
}
