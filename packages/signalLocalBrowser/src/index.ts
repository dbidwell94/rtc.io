import { ClientSignaler, PeerId, SignalerEvents } from "@rtcio/signaling";
import { BroadcastChannel } from "broadcast-channel";
import { option, result, Result } from "@dbidwell94/ts-utils";
import Logger from "@rtcio/logger";
import { v4 } from "uuid";

/**
 * A message structure for communication over the BroadcastChannel.
 */
interface P2PMessage {
  targetId: PeerId;
  senderId: PeerId;
  event: keyof SignalerEvents;
  payload: Parameters<SignalerEvents[keyof SignalerEvents]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INTERNAL_HELLO = "__internal_hello" as any;

export default class LocalSignalServer implements ClientSignaler {
  private _channel: BroadcastChannel<P2PMessage>;
  private _emitter: EventTarget;
  private _ownId: PeerId;

  #logger: Logger;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private eventHandlers: Map<Function, EventListener> = new Map();

  constructor(channelName: string = "rtc-io-signaling") {
    this._channel = new BroadcastChannel(channelName);
    this._emitter = new EventTarget();
    this._ownId = v4();

    this.#logger = new Logger(
      "rtcio:signal-local",
      "LocalSignalServer",
      this._ownId.slice(0, 8),
    );

    this._channel.onmessage = (evt) => {
      const { event: eventName, payload, targetId } = evt;

      this.#logger.verbose("channel message received: %o", {
        eventName,
        targetId,
        payload,
      });

      // this is a special case. Signaling to the "signal server" that we have
      // a new peer connection
      if (
        eventName === INTERNAL_HELLO &&
        !targetId &&
        payload[0] !== this._ownId
      ) {
        const helloEvent = new CustomEvent("newSignalPeerConnected", {
          detail: [...payload],
        });

        this._emitter.dispatchEvent(helloEvent);
      }

      if (targetId === this._ownId) {
        const customEvent = new CustomEvent(eventName, {
          detail: [...payload],
        });

        this._emitter.dispatchEvent(customEvent);
      }
    };
  }

  getRoomPeers(): Array<PeerId> {
    this.#logger.warn("LocalSignalServer does not support `getRoomPeers`");

    return [];
  }

  async connectToRoom(): Promise<Result<PeerId>> {
    setTimeout(() => {
      this.sendMessage(null as unknown as string, INTERNAL_HELLO, this._ownId);
    }, 500);
    return result.ok(this._ownId);
  }

  sendOffer(toPeer: PeerId, offer: RTCSessionDescriptionInit): void {
    this.#logger.verbose("Sending offer to {%s}: %o", toPeer, offer);
    this.sendMessage(toPeer, "offer", this._ownId, offer);
  }

  sendAnswer(toPeer: PeerId, answer: RTCSessionDescriptionInit): void {
    this.#logger.verbose("Sending answer to {%s}: %o", toPeer, answer);
    this.sendMessage(toPeer, "answer", this._ownId, answer);
  }

  sendIceCandidate(toPeer: PeerId, candidate: RTCIceCandidateInit): void {
    this.#logger.verbose(
      "Sending ice candidate to {%s}: %o",
      toPeer,
      candidate,
    );
    this.sendMessage(toPeer, "iceCandidate", this._ownId, candidate);
  }

  rejectOffer(toPeer: PeerId): void {
    this.#logger.verbose("Sending offer rejection to {%s}", toPeer);
    this.sendMessage(toPeer, "connectionRejected", this._ownId);
  }

  on<E extends keyof SignalerEvents>(
    event: E,
    listener: SignalerEvents[E],
    abortSignal?: AbortSignal,
  ): void {
    this.#logger.log("Registering event listener for event: {%s}", event);
    const wrapper = (e: Event) => {
      const payload = (e as CustomEvent<Parameters<SignalerEvents[E]>>).detail;

      // @ts-expect-error This is handled and good.
      listener(...payload);
    };

    // We need to store the references for when we call `off` later
    this.eventHandlers.set(listener, wrapper);

    if (abortSignal) {
      const abort = () => {
        abortSignal.removeEventListener("abort", abort);
        this.eventHandlers.delete(listener);
        this.#logger.log(
          "Listener aborted event {%s} with an abort signal",
          event,
        );
      };
      abortSignal.addEventListener("abort", abort);
    }

    this._emitter.addEventListener(event, wrapper, { signal: abortSignal });
  }

  off<E extends keyof SignalerEvents>(
    event: E,
    handler: SignalerEvents[E],
  ): void {
    const eventListenerOpt = option.unknown(this.eventHandlers.get(handler));

    if (eventListenerOpt.isSome()) {
      this._emitter.removeEventListener(event, eventListenerOpt.value);
      this.eventHandlers.delete(handler);
      this.#logger.log(
        "Listener successfully removed event listener for event: {%s}",
        event,
      );
    } else {
      this.#logger.warn(
        "Listener attempted to remove event listener for event {%s}, but event callback not found to be registered. " +
          "This may indicate a memory leak on the caller's side and should be investigated.",
        event,
      );
    }
  }

  async close() {
    this.#logger.log("Closed the signal listener");
  }

  private sendMessage<TKey extends keyof SignalerEvents>(
    targetId: PeerId,
    event: TKey,
    ...payload: Parameters<SignalerEvents[TKey]>
  ) {
    const message: P2PMessage = {
      targetId,
      senderId: this._ownId,
      event,
      payload,
    };

    this.#logger.verbose(
      "Sending message to peer: {%s} with message: %o",
      targetId,
      message,
    );

    this._channel.postMessage(message);
  }
}
