export class P2PError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, P2PError.prototype);
  }
}
