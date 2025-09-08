# @rtcio/signal-local

A local-only rtcio signal "server" for testing and development.

## Features

- Implements the `@rtcio/signaling` ClientSignaler interface
- Uses `BroadcastChannel` for communication between peers in the same browser context

## Installation

```bash
npm i @rtcio/signal-local
```

## Use Cases

- You just want to try the library out
- You are learning WebRTC and don't want a whole remote signal server
- You are testing your code and don't want a remote signal server
  - `@rtcio/core` uses this package for all internal tests

## Usage

```ts
import { RTC } from "@rtcio/core";
import LocalSignal from "@rtcio/signal-local";

const ROOM_NAME = "TEST_ROOM";

// Remember that we are simulating 2 peers on different machines.
// We need 2 instances of the RTC class to do that.
const client1 = new RTC(new LocalSignalServer(), ROOM_NAME);
const client2 = new RTC(new LocalSignalServer(), ROOM_NAME);

const client2Id = (await client2.connectToRoom()).unwrap();
const client1Id = (await client1.connectToRoom()).unwrap();

client2.on("connectionRequest", async (req) => {
  if (req.remoteId === client1Id) {
    await req.accept();
  } else {
    req.reject();
  }
});

client2.on("connected", (peer1) => {
  console.log(`Peer1 connected with id ${peer1.id}`);
});

await client1.connectToPeer(client2Id);
```
