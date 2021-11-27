import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  setupFiles: [
    "./jest.setup.ts"
  ]
};

export default config;
