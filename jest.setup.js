/* eslint-disable no-undef */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const wrtc = require("@roamhq/wrtc");

global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;
global.RTCDataChannel = wrtc.RTCDataChannel;
