import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  Badge,
  Avatar,
  ListItemText,
  IconButton,
} from "@mui/material";
import Mic from "@mui/icons-material/Mic";
import Headset from "@mui/icons-material/Headset";
import Settings from "@mui/icons-material/Settings";
import type { Events } from "../types";
import { createTypedHooks } from "@rtcio/react";
import { useMemo } from "react";
import { type Option } from "@dbidwell94/ts-utils";
import { useAppSelector } from "../store";
import { UserStatus } from "../store/user";

interface UsersPanelProps {
  selectedUser: Option<string>;
  onUserSelect: (userId: string) => void;
}

const { useRtc } = createTypedHooks<Events>();

const UsersPanel = ({ selectedUser, onUserSelect }: UsersPanelProps) => {
  const { myId: myIdOpt } = useRtc();

  const myId = myIdOpt.map((val) => val.substring(0, 8));
  const usersObj = useAppSelector((state) => state.users.users);

  const users = useMemo(() => {
    return Object.values(usersObj);
  }, [usersObj]);

  return (
    <Box
      sx={{
        width: 240,
        backgroundColor: "#2f3136",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: "1px solid rgba(0,0,0,0.2)",
          boxShadow: "0 1px 0 rgba(0,0,0,.2)",
        }}
      >
        <Typography variant="h6" sx={{ color: "white", fontWeight: "bold" }}>
          Direct Messages
        </Typography>
      </Box>
      <Box sx={{ flexGrow: 1, overflowY: "auto", p: 1 }}>
        <List dense>
          {users.map((user) => (
            <ListItemButton
              key={user.name}
              sx={{ borderRadius: "4px" }}
              selected={selectedUser
                .map((val) => val === user.id)
                .unwrapOr(false)}
              onClick={() => onUserSelect(user.id)}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: 1.5 }}>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  variant="dot"
                  color={
                    user.status === UserStatus.Online ? "success" : "error"
                  }
                >
                  <Avatar
                    sx={{ width: 32, height: 32, bgcolor: "primary.main" }}
                  >
                    {user.name.charAt(0)}
                  </Avatar>
                </Badge>
              </ListItemIcon>
              <ListItemText
                primary={user.name}
                primaryTypographyProps={{ sx: { color: "text.primary" } }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Box
        sx={{
          p: 1,
          backgroundColor: "#292b2f",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          variant="dot"
          sx={{
            "& .MuiBadge-dot": {
              backgroundColor: "#43b581",
              width: 10,
              height: 10,
              borderRadius: "50%",
              border: "2px solid #292b2f",
            },
          }}
        >
          <Avatar sx={{ width: 32, height: 32 }}>Y</Avatar>
        </Badge>
        <Box sx={{ ml: 1, flexGrow: 1 }}>
          <Typography
            variant="body2"
            sx={{ color: "white", fontWeight: "bold" }}
          >
            You
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            @{myId.unwrapOr("Not Connected")}
          </Typography>
        </Box>
        <IconButton size="small" sx={{ color: "text.secondary" }}>
          <Mic />
        </IconButton>
        <IconButton size="small" sx={{ color: "text.secondary" }}>
          <Headset />
        </IconButton>
        <IconButton size="small" sx={{ color: "text.secondary" }}>
          <Settings />
        </IconButton>
      </Box>
    </Box>
  );
};

export default UsersPanel;
