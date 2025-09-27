import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../store";
import { option } from "@dbidwell94/ts-utils";
import {
  Box,
  Button,
  Divider,
  FormControl,
  Input,
  InputLabel,
  Modal,
  Paper,
  Typography,
} from "@mui/material";
import { createTypedHooks } from "@rtcio/react";
import type { Events } from "../types";
import { createKeyPair } from "../store/user";

const { usePeerEmitter } = createTypedHooks<Events>();

export default function PromptForEncryption() {
  const dispatch = useAppDispatch();
  const keyOpt = useAppSelector((state) => state.users.keyPair);
  const [modalOpened, setModalOpened] = useState(option.isNone(keyOpt));

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const onSubmit = useCallback(
    (evt: React.FormEvent) => {
      evt.preventDefault();
      if (!name.trim()) {
        return;
      }
      dispatch(
        createKeyPair({
          email:
            email.trim().length < 1 ? option.none() : option.some(email.trim()),
          name,
        }),
      );
    },
    [email, name, dispatch],
  );

  const { emit } = usePeerEmitter();

  useEffect(() => {
    if (option.isSome(keyOpt)) {
      emit("publicKey", keyOpt.value.publicKey);
    }
  }, [keyOpt, emit]);

  return (
    <Modal
      open={modalOpened}
      onClose={() => setModalOpened(false)}
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        margin: "0rem 5rem",
      }}
    >
      <Paper elevation={10} sx={{ padding: ".5rem 2rem", textAlign: "center" }}>
        <Typography variant="h5">
          You are missing end-to-end encryption keys.
        </Typography>
        <Typography>
          You may continue to use the program, but you will not have persistant
          chats and will be completely anonomous. If you wish to have a more
          full experience, please enter your information below
        </Typography>
        <Typography sx={{ marginTop: "1rem" }}>
          Note: This information is saved LOCALLY ONLY and is only used to
          generate pgp encryption keys. The "Name" will be displayed on remote
          clients instead of a UUIDv4
        </Typography>
        <Divider />

        <Box>
          <form
            style={{ display: "flex", flexDirection: "column" }}
            onSubmit={onSubmit}
          >
            <FormControl sx={{ margin: "1rem 0rem" }}>
              <InputLabel htmlFor="name-field">Name</InputLabel>
              <Input
                id="name-field"
                name="name"
                value={name}
                onChange={({ target: { value } }) => setName(value)}
              />
            </FormControl>

            <FormControl sx={{ margin: "1rem 0rem" }}>
              <InputLabel htmlFor="email-field">Email</InputLabel>
              <Input
                id="email-field"
                name="email"
                value={email}
                onChange={({ target: { value } }) => setEmail(value)}
              />
            </FormControl>

            <Button type="submit" variant="contained" disabled={!name}>
              Submit
            </Button>
          </form>
        </Box>
      </Paper>
    </Modal>
  );
}
