import { debug, type Debugger } from "debug";

type Params = Parameters<Debugger>;

export default class Logger {
  #log: Debugger;
  #warn: Debugger;
  #error: Debugger;
  #verbose: Debugger;

  constructor(modulePath: string, className?: string, instance?: string) {
    this.#log = debug(modulePath);

    if (className) {
      this.#log = this.#log.extend(className);
    }
    if (instance) {
      this.#log = this.#log.extend(`[${instance}]`);
    }

    this.#warn = this.#log.extend("warn");
    this.#error = this.#log.extend("error");
    this.#verbose = this.#log.extend("verbose");
  }

  log(...args: Params) {
    this.#log(...args);
  }

  verbose(...args: Params) {
    this.#verbose(...args);
  }

  warn(...args: Params) {
    this.#warn(...args);
  }

  error(...args: Params) {
    this.#error(...args);
  }
}
