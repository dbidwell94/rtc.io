/* eslint-disable @typescript-eslint/no-require-imports */

const wrtc = require("@roamhq/wrtc");
const util = require("util");
const stream = require("node:stream/web");
const blob = require("node:buffer");

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
