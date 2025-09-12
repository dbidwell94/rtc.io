import { CssBaseline, Box, ThemeProvider, createTheme } from "@mui/material";
import React from "react";
import ChatArea from "./components/ChatArea";
import UsersPanel from "./components/UserPanel";
import type { Events } from "./types";
import { createTypedHooks } from "@rtcio/react";
import { option, type Option } from "@dbidwell94/ts-utils";
import { useAppDispatch } from "./store";
import { addMessage } from "./store/messages";
import { addUser, setUserStatus, UserStatus } from "./store/user";

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

  const [selectedUser, setSelectedUser] = React.useState<Option<string>>(
    option.none(),
  );

  const { rtc, myId } = useRtc();

  useRtcListener("connectionRequest", (req) => req.accept());
  useRtcListener("connected", (peer) => {
    dispatch(
      addUser({
        status: UserStatus.Online,
        connectedAt: new Date().getTime(),
        id: peer.id,
        name: peer.id,
      }),
    );
  });
  useRtcListener("signalPeerConnected", (peerId) => {
    rtc.inspect((val) => val.connectToPeer(peerId));
  });

  usePeerListener("connectionClosed", (peerId) => {
    dispatch(setUserStatus({ status: UserStatus.Offline, userId: peerId }));
  });

  usePeerListener("message", (peerId, message) => {
    if (rtc.isNone() || myId.isNone()) return;
    dispatch(
      addMessage({
        myId: myId.value,
        createdAt: message.time,
        fromId: peerId,
        toId: myId.value,
        id: message.id,
        text: message.text,
      }),
    );
  });

  const handleUserSelect = (userId: string) => {
    setSelectedUser(option.some(userId));
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
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
