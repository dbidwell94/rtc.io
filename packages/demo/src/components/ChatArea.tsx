import {
  AddCircleOutline,
  GifBoxOutlined,
  AttachFile,
  EmojiEmotions,
} from "@mui/icons-material";
import {
  Box,
  Typography,
  Avatar,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Paper,
} from "@mui/material";
import type { Events } from "../types";
import { option, type Option } from "@dbidwell94/ts-utils";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createTypedHooks } from "@rtcio/react";
import { v4 } from "uuid";
import { useAppDispatch, useAppSelector } from "../store";
import { addMessage } from "../store/messages";
import { UserStatus } from "../store/user";

interface ChatAreaProps {
  user: Option<string>;
}

const { usePeerEmitter, useRtc, usePeerListener } = createTypedHooks<Events>();

const ChatArea = ({ user: userIdOpt }: ChatAreaProps) => {
  const globalMessages = useAppSelector((state) => state.message.messages);
  const dispatch = useAppDispatch();
  const users = useAppSelector((state) => state.users.users);
  const [messageData, setMessageData] = useState("");
  const { emitTo } = usePeerEmitter();
  const { myId: myIdOpt } = useRtc();
  const messageScrollRef = useRef<HTMLElement>(null);
  const [emitTypingTimeout, setEmitTypingTimeout] = useState(
    option.none<ReturnType<typeof setTimeout>>(),
  );
  const [remoteUserIsTyping, setRemoteUserIsTyping] = useState(false);
  const [remoteUserTypingTimeout, setRemoteUserTypingTimeout] = useState(
    option.none<ReturnType<typeof setTimeout>>(),
  );

  usePeerListener(
    "typing",
    () => {
      const timeout = setTimeout(() => {
        setRemoteUserIsTyping(false);
        setRemoteUserTypingTimeout(option.none());
        clearTimeout(timeout);
      }, 1000);
      remoteUserTypingTimeout.inspect((timeout) => clearTimeout(timeout));
      setRemoteUserTypingTimeout(option.some(timeout));
      setRemoteUserIsTyping(true);
    },
    userIdOpt.unsafeUnwrap(),
  );

  useEffect(() => {
    return () => {
      // emitTypingTimeout.inspect((timeout) => clearTimeout(timeout));
    };
  }, []);

  useEffect(() => {
    if (!messageScrollRef.current) return;
    const node = messageScrollRef.current;

    const SCROLL_BUFFER = 100;
    const isOnBottom =
      node.scrollHeight - node.scrollTop <= node.clientHeight + SCROLL_BUFFER;

    if (isOnBottom) {
      node.scrollTo({
        behavior: "instant",
        top: node.scrollHeight,
      });
    }
  }, [globalMessages]);

  useEffect(() => {
    if (
      !messageData.trim() ||
      emitTypingTimeout.isSome() ||
      userIdOpt.isNone()
    ) {
      return;
    }

    emitTo(userIdOpt.value, "typing");
    const timeout = setTimeout(() => {
      console.log("Clearing timeout");
      setEmitTypingTimeout(option.none());
    }, 750);
    setEmitTypingTimeout(option.some(timeout));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageData, userIdOpt]);

  const onSubmit = useCallback(
    (evt: React.FormEvent) => {
      evt.preventDefault();
      if (!messageData.trim() || userIdOpt.isNone() || myIdOpt.isNone()) {
        return;
      }
      const createdAt = new Date().getTime();
      const messageId = v4();
      emitTo(userIdOpt.value, "message", {
        id: messageId,
        text: messageData.trim(),
        time: createdAt,
        avatar: myIdOpt.value.substring(0, 2),
        user: myIdOpt.value.substring(0, 8),
      });
      dispatch(
        addMessage({
          myId: myIdOpt.value,
          createdAt,
          fromId: myIdOpt.value,
          toId: userIdOpt.value,
          id: messageId,
          text: messageData.trim(),
        }),
      );
      setMessageData("");
    },
    [messageData, userIdOpt, emitTo, myIdOpt, dispatch],
  );

  const userOpt = userIdOpt.andThen((id) => option.unknown(users[id]));

  if (userOpt.isNone() || myIdOpt.isNone()) {
    return (
      <Box
        sx={{
          flexGrow: 1,
          backgroundColor: "#36393f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="h5" sx={{ color: "text.secondary" }}>
          Select a conversation
        </Typography>
      </Box>
    );
  }

  const user = userOpt.value;
  const messages = globalMessages[user.id] ?? [];
  const myId = myIdOpt.value;

  return (
    <Box
      sx={{
        flexGrow: 1,
        backgroundColor: "#36393f",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          p: "10px 16px",
          borderBottom: "1px solid rgba(0,0,0,0.2)",
          boxShadow: "0 1px 0 rgba(0,0,0,.2)",
        }}
      >
        <Typography
          variant="h6"
          component="div"
          sx={{ color: "text.secondary", mr: 1, fontWeight: "medium" }}
        >
          @
        </Typography>
        <Typography variant="h6" sx={{ color: "white", fontWeight: "bold" }}>
          {user.name}
        </Typography>
      </Box>
      <Box
        ref={messageScrollRef}
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.map((msg) => (
          <Fragment key={msg.id}>
            {msg.fromId === myId ? (
              <Paper
                elevation={5}
                sx={{
                  alignSelf: "end",
                  padding: "1rem",
                  display: "flex",
                  mb: 2,
                  ml: 30,
                  width: "fit-content",
                }}
              >
                <Avatar
                  sx={{ width: 40, height: 40, mr: 2, bgcolor: "primary.main" }}
                >
                  {msg.fromId.substring(0, 2)}
                </Avatar>
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
                    <Typography
                      sx={{ color: "white", fontWeight: "medium", mr: 1 }}
                    >
                      {msg.fromId.substring(0, 8)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary" }}
                    >
                      {new Date(msg.createdAt).toLocaleString()}
                    </Typography>
                  </Box>
                  <Typography sx={{ color: "text.primary" }}>
                    {msg.text}
                  </Typography>
                </Box>
              </Paper>
            ) : (
              <Paper
                elevation={5}
                sx={{
                  display: "flex",
                  mb: 2,
                  mr: 30,
                  padding: "1rem",
                  width: "fit-content",
                }}
              >
                <Avatar
                  sx={{ width: 40, height: 40, mr: 2, bgcolor: "primary.main" }}
                >
                  {msg.fromId.substring(0, 2)}
                </Avatar>
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
                    <Typography
                      sx={{ color: "white", fontWeight: "medium", mr: 1 }}
                    >
                      {msg.fromId.substring(0, 8)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary" }}
                    >
                      {new Date(msg.createdAt).toLocaleString()}
                    </Typography>
                  </Box>
                  <Typography sx={{ color: "text.primary" }}>
                    {msg.text}
                  </Typography>
                </Box>
              </Paper>
            )}
          </Fragment>
        ))}
      </Box>
      {remoteUserIsTyping && (
        <Typography color="textDisabled">{user.name} is typing...</Typography>
      )}
      {user.status === UserStatus.Offline && (
        <Typography color="textDisabled" padding="0 1rem">
          {user.name} has left the chat
        </Typography>
      )}
      <form style={{ width: "100%" }} onSubmit={onSubmit} autoComplete="off">
        <Box sx={{ p: "0 16px 24px" }} display={"flex"}>
          <TextField
            fullWidth
            disabled={user.status !== UserStatus.Online}
            variant="filled"
            placeholder={`Message @${user.name}`}
            value={messageData}
            onChange={({ target: { value } }) => setMessageData(value)}
            sx={{
              "& .MuiFilledInput-root": {
                backgroundColor: "#40444b",
                borderRadius: "8px",
                "&:hover": { backgroundColor: "#40444b" },
                "&.Mui-focused": { backgroundColor: "#40444b" },
                "&::before, &::after": { display: "none" },
              },
              "& .MuiFilledInput-input": { py: "12px" },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <IconButton
                    edge="start"
                    sx={{ color: "text.secondary" }}
                    disabled={user.status !== UserStatus.Online}
                  >
                    <AddCircleOutline />
                  </IconButton>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      sx={{ color: "text.secondary" }}
                      disabled={user.status !== UserStatus.Online}
                    >
                      <GifBoxOutlined />
                    </IconButton>
                    <IconButton
                      sx={{ color: "text.secondary" }}
                      disabled={user.status !== UserStatus.Online}
                    >
                      <AttachFile />
                    </IconButton>
                    <IconButton
                      sx={{ color: "text.secondary" }}
                      disabled={user.status !== UserStatus.Online}
                    >
                      <EmojiEmotions />
                    </IconButton>
                    <Button
                      variant="outlined"
                      type="submit"
                      color="secondary"
                      disabled={user.status !== UserStatus.Online}
                    >
                      Submit
                    </Button>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      </form>
    </Box>
  );
};

export default ChatArea;
