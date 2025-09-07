# @rtcio/core

A P2P connection library aimed to make RTCPeerConnections easier to use.

## Features

- Built in TypeScript and is fully typed
- Works with your custom signal server via an implemented interface
- Binary data handling
- Automatic data chunking with configurable chunk sizes
- Native support for sending `File`s
- Generic typed parameters for custom events listeners and emitters
- Logging available via the [debug](https://www.npmjs.com/package/debug) library

## Installation

```bash
npm install @rtcio/core
```

## Usage

```ts
import { RTC } from "@rtcio/core";
import { SocketIoSignaler } from "@rtcio/socket-io-client";

const ROOM_NAME = "signalerRoom1";

// Define your own data contract here.
interface MyCustomEvents {
  // functions can be async, take any JSON serializable param,
  // but they MUST always return void. I mean, I guess they
  // don't have to. But RTC won't do anything with the data :)
  message: (messageText: string) => void;
  wantFile: () => void;
  wantData: () => void;
}

// The official SocketIoSignaler is coming soon. For now, you can
// implement your own signaler by implementing `@rtcio/signaling`
const io = new RTC<MyCustomEvents>({
  // This is an implementation of the `ClientSignaler` interface
  // from `@rtcio/signaling`. You may provide your own, or use a
  // pre-built one. More signal implementations are coming soon.
  signaler: new SocketIoSignaler(socketArgs),
  // This is the specific room you want to connect to on the signaler.
  // You will not be able to connect to peers in different rooms.
  roomName: ROOM_NAME,
  // Not required. If not present, RTC will use 4 default Google STUN
  // servers.
  iceServers: [],
  // Not required. Defaults are provided. This number represents how long
  // before we receive a new binary data packet before we consider the
  // transfer timed out.
  // !! IMPORTANT -- this is for individual packets, not the whole transfer
  dataTimeoutMs: 5_000,
  // Not required. Defaults are provided. This number represents how large
  // the chunked data packets are in bytes.
  // !! IMPORTANT -- this should be set to a sensible "happy medium" that
  // works for all browsers. If you send 64MB chunks, Safari is going to
  // have to receive that packet and it _probably_ won't be happy ;)
  maxChunkSizeBytes: 1024;
});

const idResult = await io.connectToRoom();
// This project leverages the type safe `Option` and `Result` api
// from Rust via the `@dbidwell94/ts-utils` package.
if (idResult.isError()) {
  console.error(idResult.error);
  return;
}

const myLocalId = idResult.value;

io.on("connected", (newPeer) => {
  // Emitting custom events to a remote peer
  newPeer.emit("message", "Hello, and welcome to rtcio!");

  // Subscribing to events FROM a remote peer
  newPeer.on("message", (messageText) => {
    console.log(`New message from ${newPeer.id}: ${messageText}`);
  });

  newPeer.on("wantFile", async () => {
    // Supports sending a raw `File` to a remote peer
    // via streaming directly from the file system
    // without loading the whole file into memory
    await newPeer.sendFile(yourFile);
  });

  newPeer.on("wantData", async () => {
    // Have some arbitrary data you want to send?
    // Supports sending raw `ArrayBuffer`s to a remote
    // peer and automatically handles the data chunking for you!
    await newPeer.sendRaw(yourData);
  });
});

// This event will fire when you get a connection request FROM
// a remote peer via the signal server. You may choose to accept
// or reject the connection here.
io.on("connectionRequest", async ({ accept, reject, remoteId }) => {
  if (remoteId === theIdIExpectedToGetFromMyBestBud) {
    await accept();
  } else {
    reject();
  }
})

// This will get all the current connected peers to the
// signal server's room you are in
const roomPeers = await io.getRoomPeers();

for (const peerId of roomPeers) {
  // This is how you initialize your connection to a peer.
  // This will fire the 'connectionRequest' event on the
  // remote peer
  await io.connectToPeer(peerId);
}
```
