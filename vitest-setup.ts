import wrtc from "@roamhq/wrtc";
import util from "util";
import stream from "node:stream/web";
import blob from "node:buffer";

Object.defineProperties(globalThis, {
  TextEncoder: { value: util.TextEncoder },
  TextDecoder: { value: util.TextDecoder },
  RTCPeerConnection: { value: wrtc.RTCPeerConnection },
  RTCDataChannel: { value: wrtc.RTCDataChannel },
  RTCSessionDescription: { value: wrtc.RTCSessionDescription },
  RTCIceCandidate: { value: wrtc.RTCIceCandidate },
  ReadableStream: { value: stream.ReadableStream },
  File: { value: blob.File },
  Blob: { value: blob.Blob },
});
