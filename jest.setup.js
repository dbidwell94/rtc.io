/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

const wrtc = require("@roamhq/wrtc");
const util = require("util");

global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;
global.RTCDataChannel = wrtc.RTCDataChannel;
global.TextEncoder = util.TextEncoder;
global.TextDecoder = util.TextDecoder;
