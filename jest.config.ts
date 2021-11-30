import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  setupFiles: ["./jest.setup-env.ts"],
  setupFilesAfterEnv: ["./jest.setup.ts"],
  roots: ["./src"],
  clearMocks: true,
};

export default config;
