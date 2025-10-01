import { rtcioServer } from "@rtcio/socket-io-server";

rtcioServer({
  cors: {
    origin: "http://localhost:5173",
  },
  cleanupEmptyChildNamespaces: true,
}).listen(3000);
