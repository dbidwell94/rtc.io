
# rtc.io

Inspired by socket.io, rct.io is an easier to use way of dealing with WebRTC.
It wraps the logic of creating RTCPeerConnections in easy-to-use callback
chaining.
## Features

- Built in TypeScript and is fully typed
- Works with your custom signal server via an implemented interface
- Generic typed parameters for custom events listeners and emitters
- Only one production dependency


## Roadmap

- Finish implementing RTCDataChannel and RTCPeerConnection abstraction

- Abstract video and audio streams


## Usage/Examples

```typescript
import { rtc } from 'rtc.io'
import signalServer from '../yourSignalServerApi'
import { iceConfig } from '../config/yourIceConfig';

interface IMyCustomEvent {
    message: (message: string) => void;
}

const p2p = rtc<IMyCustomEvent>(signalServer, iceConfig);

p2p.on('connection' (peer) => {

    // Fully typed event injects the parameter type into the callback
    peer.on('message', (msg) => {
        console.log(msg);
    })

    // Some already built in events ready to use
    peer.on('close', () => {
        console.log(`Peer ${peer.id} closed the connection`);
    })

    // You can overload your callbacks to have more than 1 fire
    // when an event is received.
    peer.on('message' (msg) => {
        console.log("2nd callback!");
    })
});
```

