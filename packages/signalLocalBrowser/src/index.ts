import { ClientSignaler, UUID, SignalerEvents } from "@rtcio/signaling";
import { BroadcastChannel } from "broadcast-channel";
import { option } from "@dbidwell94/ts-utils";

/**
 * A message structure for communication over the BroadcastChannel.
 */
interface P2PMessage {
  targetId: UUID;
  senderId: UUID;
  event: keyof SignalerEvents;
  payload: Parameters<SignalerEvents[keyof SignalerEvents]>;
}

export default class LocalSignalServer implements ClientSignaler {
  private _channel: BroadcastChannel<P2PMessage>;
  private _emitter: EventTarget;
  private _ownId: UUID;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private eventHandlers: Map<Function, EventListener> = new Map();

  constructor(channelName: string = "rtc-io-signaling") {
    this._channel = new BroadcastChannel(channelName);
    this._emitter = new EventTarget();
    this._ownId = crypto.randomUUID();

    this._channel.onmessage = (evt) => {
      const { event: eventName, payload, targetId } = evt;

      if (targetId === this._ownId) {
        const customEvent = new CustomEvent(eventName, {
          detail: [...payload],
        });

        this._emitter.dispatchEvent(customEvent);
      }
    };
  }

  getRoomPeers(): Array<UUID> {
    console.warn("LocalSignalServer does not support `getRoomPeers`");

    return [];
  }

  async connectToRoom(): Promise<UUID> {
    return this._ownId;
  }

  sendOffer(toPeer: UUID, offer: RTCSessionDescriptionInit): void {
    this.sendMessage(toPeer, "offer", this._ownId, offer);
  }

  sendAnswer(toPeer: UUID, answer: RTCSessionDescriptionInit): void {
    this.sendMessage(toPeer, "answer", this._ownId, answer);
  }

  sendIceCandidate(toPeer: UUID, candidate: RTCIceCandidateInit): void {
    this.sendMessage(toPeer, "iceCandidate", this._ownId, candidate);
  }

  rejectOffer(toPeer: UUID): void {
    this.sendMessage(toPeer, "connectionRejected", this._ownId);
  }

  on<E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
  ): void {
    const wrapper = (e: Event) => {
      const payload = (e as CustomEvent<Parameters<SignalerEvents[E]>>).detail;

      // @ts-expect-error This is handled and good.
      listener(...payload);
    };

    // We need to store the references for when we call `off` later
    this.eventHandlers.set(listener, wrapper);

    this._emitter.addEventListener(event, wrapper);
  }

  off<E extends keyof SignalerEvents>(
    event: E,
    handler: SignalerEvents[E],
  ): void {
    const eventListenerOpt = option.unknown(this.eventHandlers.get(handler));

    if (eventListenerOpt.isSome()) {
      this._emitter.removeEventListener(event, eventListenerOpt.value);
      this.eventHandlers.delete(handler);
    }
  }

  async close() {}

  private sendMessage<TKey extends keyof SignalerEvents>(
    targetId: UUID,
    event: TKey,
    ...payload: Parameters<SignalerEvents[TKey]>
  ) {
    const message: P2PMessage = {
      targetId,
      senderId: this._ownId,
      event,
      payload,
    };

    this._channel.postMessage(message);
  }
}
