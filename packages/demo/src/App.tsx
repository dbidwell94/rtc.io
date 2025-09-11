import { CssBaseline, Box, ThemeProvider, createTheme } from "@mui/material";
import React from "react";
import ChatArea from "./components/ChatArea";
import UsersPanel from "./components/UserPanel";
import type { User, Message, Events } from "./types";
import { createTypedHooks } from "@rtcio/react";
import { option, type Option } from "@dbidwell94/ts-utils";

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
  const [users, setUsers] = React.useState<User[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [selectedUser, setSelectedUser] = React.useState<Option<User>>(
    option.none(),
  );

  const rtc = useRtc();

  useRtcListener("connectionRequest", (req) => req.accept());
  useRtcListener("connected", (peer) => {
    setUsers((curr) => [
      ...curr,
      { name: peer.id.substring(0, 8), status: "online", id: peer.id },
    ]);
  });
  useRtcListener("signalPeerConnected", (peerId) => {
    rtc.inspect((val) => val.connectToPeer(peerId));
  });

  usePeerListener("message", (_, message) => {
    console.log(message);
    setMessages((curr) => [...curr, message]);
  });

  const handleUserSelect = (user: User) => {
    setSelectedUser(option.some(user));
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
          users={users}
          selectedUser={selectedUser}
          onUserSelect={handleUserSelect}
        />
        <ChatArea user={selectedUser} messages={messages} />
      </Box>
    </ThemeProvider>
  );
}
