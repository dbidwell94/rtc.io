import path from "path";
import fs from "fs";
import { createDefaultPreset, pathsToModuleNameMapper } from "ts-jest";

function getPackageTsConfigs() {
  // eslint-disable-next-line no-undef
  const packagesDir = path.join(process.cwd(), "packages");

  return fs
    .readdirSync(packagesDir)
    .map((pkgName) => path.join(packagesDir, pkgName, "tsconfig.json"))
    .filter((configPath) => fs.existsSync(configPath));
}

const moduleNameMapper = getPackageTsConfigs().reduce(
  (mapper, tsConfigPath) => {
    const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, "utf8"));
    const packageDir = path.dirname(tsConfigPath);

    if (tsConfig.compilerOptions && tsConfig.compilerOptions.paths) {
      const newMapper = pathsToModuleNameMapper(
        tsConfig.compilerOptions.paths,
        {
          // eslint-disable-next-line no-undef
          prefix: `<rootDir>/${path.relative(process.cwd(), packageDir)}/`,
        },
      );

      Object.assign(mapper, newMapper);
    }
  },
  {},
);

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  testEnvironment: "jsdom",
  transform: {
    ...tsJestTransformCfg,
  },
  setupFilesAfterEnv: ["./jest.setup.js"],
  moduleNameMapper,
};
