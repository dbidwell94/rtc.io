import {
  AddCircleOutline,
  GifBoxOutlined,
  AttachFile,
  EmojiEmotions,
  Send,
} from "@mui/icons-material";
import {
  Box,
  Typography,
  Avatar,
  TextField,
  InputAdornment,
  IconButton,
  Paper,
} from "@mui/material";
import type { Events } from "../types";
import { option, type Option } from "@dbidwell94/ts-utils";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createTypedHooks } from "@rtcio/react";
import { v4 } from "uuid";
import { useAppDispatch, useAppSelector } from "../store";
import { addMessage } from "../store/messages";
import { UserStatus } from "../store/user";
import { createMessage, encrypt, type Key, readKey } from "openpgp";

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
  const [remoteEncryptionKey, setRemoteEncryptionKey] = useState(
    option.none<Key>(),
  );
  const userOpt = useMemo(
    () => userIdOpt.andThen((id) => option.unknown(users[id])),
    [users, userIdOpt],
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
      emitTypingTimeout.inspect((timeout) => clearTimeout(timeout));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!messageData.trim() || emitTypingTimeout.isSome() || userOpt.isNone()) {
      return;
    }

    emitTo(userOpt.value.id, "typing");
    const timeout = setTimeout(() => {
      setEmitTypingTimeout(option.none());
    }, 750);
    setEmitTypingTimeout(option.some(timeout));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageData, userIdOpt]);

  const onSubmit = useCallback(
    async (evt: React.FormEvent) => {
      evt.preventDefault();
      if (!messageData.trim() || userOpt.isNone() || myIdOpt.isNone()) {
        return;
      }
      const createdAt = new Date().getTime();
      const messageId = v4();

      let messageText: string;
      let isEncrypted;

      if (option.isSome(userOpt.value.publicKey)) {
        let encryptionKey: Key;
        if (remoteEncryptionKey.isNone()) {
          encryptionKey = await readKey({
            armoredKey: userOpt.value.publicKey.value,
          });
          setRemoteEncryptionKey(option.some(encryptionKey));
        } else {
          encryptionKey = remoteEncryptionKey.value;
        }
        const message = await createMessage({ text: messageData.trim() });

        messageText = await encrypt<string>({
          message,
          encryptionKeys: encryptionKey,
        });
        isEncrypted = true;
      } else {
        messageText = messageData.trim();
        isEncrypted = false;
      }

      emitTo(
        userOpt.value.id,
        "message",
        {
          id: messageId,
          text: messageText,
          time: createdAt,
          avatar: myIdOpt.value.substring(0, 2),
          user: myIdOpt.value.substring(0, 8),
        },
        isEncrypted,
      );

      dispatch(
        addMessage({
          myId: myIdOpt.value,
          createdAt,
          fromId: myIdOpt.value,
          toId: userOpt.value.id,
          id: messageId,
          text: messageData.trim(),
        }),
      );
      setMessageData("");
    },
    [messageData, userOpt, emitTo, myIdOpt, dispatch, remoteEncryptionKey],
  );

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
  console.log({ user });
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
                  {user.name.substring(0, 1)}
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
            placeholder={`Message ${user.name}`}
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
                    <IconButton
                      type="submit"
                      sx={{ color: "text.secondary" }}
                      disabled={user.status !== UserStatus.Online}
                    >
                      <Send />
                    </IconButton>
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
