import { option } from "@dbidwell94/ts-utils";
import { ClientSignaler, SignalerEvents, UUID } from "../src/signaling";
import { EventEmitter } from "node:events";

class Bus extends EventEmitter {
  public rooms: Record<string, Set<UUID>>;

  constructor() {
    super();
    this.rooms = {};
  }
}

export const createBus = () => new Bus();

export class TestSignaler implements ClientSignaler {
  private ownId: UUID;
  private roomId: string | null;
  private emitter = new EventEmitter();
  private bus: Bus;

  constructor(id: UUID, bus: Bus) {
    this.ownId = id;
    this.roomId = null;
    this.bus = bus;

    this.bus.on(
      "message",
      (targetId: string, event: keyof SignalerEvents, ...args: unknown[]) => {
        if (targetId === this.ownId) {
          this.emitter.emit(event, ...args);
        }
      },
    );
  }

  getRoomPeers(): Array<UUID> {
    if (!this.roomId) return [];
    const roomsOpt = option.unknown(this.bus.rooms[this.roomId]);
    if (roomsOpt.isNone()) return [];
    return [...roomsOpt.value];
  }

  rejectOffer(from: UUID) {
    this.sendMessage(from, "connectionRejected");
  }

  async connectToRoom(roomName: string): Promise<UUID> {
    this.roomId = roomName;

    if (this.bus.rooms[roomName]) {
      this.bus.rooms[roomName].add(this.ownId);
    } else {
      this.bus.rooms[roomName] = new Set([this.ownId]);
    }

    return this.ownId;
  }

  on<E extends keyof SignalerEvents>(event: E, listener: SignalerEvents[E]) {
    this.emitter.on(event, listener);
  }

  off<E extends keyof SignalerEvents>(event: E, listener: SignalerEvents[E]) {
    this.emitter.off(event, listener);
  }

  private sendMessage(
    targetId: string,
    event: keyof SignalerEvents,
    ...args: unknown[]
  ) {
    this.bus.emit("message", targetId, event, ...[this.ownId, ...args]);
  }

  sendOffer(toPeer: UUID, offer: RTCSessionDescriptionInit) {
    this.sendMessage(toPeer, "offer", offer);
  }

  sendAnswer(toPeer: UUID, answer: RTCSessionDescriptionInit) {
    this.sendMessage(toPeer, "answer", answer);
  }

  sendIceCandidate(toPeer: UUID, candidate: RTCIceCandidateInit) {
    this.sendMessage(toPeer, "iceCandidate", candidate);
  }

  close() {}
}

export interface WaitForOptions {
  /** The maximum time to wait in milliseconds. Defaults to 1000ms. */
  timeout?: number;
  /** The interval between checks in milliseconds. Defaults to 50ms. */
  interval?: number;
}

export const waitFor = <T>(
  callback: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> => {
  const { timeout = 1000, interval = 50 } = options;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = async () => {
      try {
        const result = await callback();
        resolve(result);
      } catch (error) {
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime >= timeout) {
          // Reject with the last error thrown by the callback
          reject(error);
        } else {
          // Wait for the interval then check again
          setTimeout(check, interval);
        }
      }
    };

    check();
  });
};
