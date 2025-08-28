import { createDefaultPreset, pathsToModuleNameMapper } from "ts-jest";
import tsConfig from "./tsconfig.json" with { type: "json" };

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  testEnvironment: "jsdom",
  transform: {
    ...tsJestTransformCfg,
  },
  setupFilesAfterEnv: ["./jest.setup.js"],
  moduleNameMapper: pathsToModuleNameMapper(tsConfig.compilerOptions.paths, {
    prefix: "<rootDir>/",
  }),
};
