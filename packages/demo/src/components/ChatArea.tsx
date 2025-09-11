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
} from "@mui/material";
import type { User, Message, Events } from "../types";
import { type Option } from "@dbidwell94/ts-utils";
import { useCallback, useState } from "react";
import { createTypedHooks } from "@rtcio/react";

interface ChatAreaProps {
  user: Option<User>;
  messages: Message[];
}

const { usePeerEmitter, useRtc } = createTypedHooks<Events>();

const ChatArea = ({ user: userOpt, messages }: ChatAreaProps) => {
  const [messageData, setMessageData] = useState("");
  const { emitTo } = usePeerEmitter();
  const rtc = useRtc();

  const onSubmit = useCallback(
    (evt: React.FormEvent) => {
      evt.preventDefault();
      if (!messageData.trim() || userOpt.isNone() || rtc.isNone()) {
        return;
      }
      emitTo(userOpt.value.id, "message", {
        text: messageData.trim(),
        time: new Date().getTime(),
        avatar: rtc.value
          .id()
          .map((id) => id.substring(0, 2))
          .unwrapOr("Unk"),
        user: rtc.value
          .id()
          .map((id) => id.substring(0, 8))
          .unwrapOr("Unknown"),
      });
      setMessageData("");
    },
    [messageData, userOpt, emitTo, rtc],
  );

  if (userOpt.isNone()) {
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
      <Box sx={{ flexGrow: 1, overflowY: "auto", p: 2 }}>
        {/* Note: In a real app, you would filter messages based on the selected user */}
        {messages.map((msg, index) => (
          <Box key={index} sx={{ display: "flex", mb: 2 }}>
            <Avatar
              sx={{ width: 40, height: 40, mr: 2, bgcolor: "primary.main" }}
            >
              {msg.avatar}
            </Avatar>
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
                <Typography
                  sx={{ color: "white", fontWeight: "medium", mr: 1 }}
                >
                  {msg.user}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {new Date(msg.time).toLocaleString()}
                </Typography>
              </Box>
              <Typography sx={{ color: "text.primary" }}>{msg.text}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
      <form style={{ width: "100%" }} onSubmit={onSubmit}>
        <Box sx={{ p: "0 16px 24px" }} display={"flex"}>
          <TextField
            fullWidth
            variant="filled"
            placeholder={`Message @${user.name}`}
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
                  <IconButton edge="start" sx={{ color: "text.secondary" }}>
                    <AddCircleOutline />
                  </IconButton>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton sx={{ color: "text.secondary" }}>
                      <GifBoxOutlined />
                    </IconButton>
                    <IconButton sx={{ color: "text.secondary" }}>
                      <AttachFile />
                    </IconButton>
                    <IconButton sx={{ color: "text.secondary" }}>
                      <EmojiEmotions />
                    </IconButton>
                    <Button variant="outlined" type="submit" color="secondary">
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
