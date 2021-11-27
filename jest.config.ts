import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  setupFiles: ["./jest.setup.ts"],
  roots: ["./src"],
};

export default config;
