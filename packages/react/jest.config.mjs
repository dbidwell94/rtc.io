import base from "../../jest.config.mjs";

/** @type {import("jest").Config} **/
export default {
  ...base,
  testEnvironment: "jsdom",
  projects: ["<rootDir>/packages/*/jest.config.mjs"],
  globals: {
    "ts-jest": {
      tsConfig: "packages/tsconfig.json",
    },
  },
};
