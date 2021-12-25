import { NanoClient } from "@dev-ptera/nano-node-rpc";
import _debug from "debug";
const debug = _debug("nano-rpc");

export const nanoClient = new NanoClient({
  url: process.env.NANO_NODE_URL,
  requestHeaders: {
    ...(process.env.NANO_NODE_API_KEY ? {
      "Authorization": process.env.NANO_NODE_API_KEY,
    } : {}),
  }
});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const clientAsAny = nanoClient as any;
const clientProps = Object.getOwnPropertyNames(Object.getPrototypeOf(nanoClient));

for (const prop of clientProps) {
  if (!prop.startsWith("_") && typeof clientAsAny[prop] === "function") {
    const originalFunc = clientAsAny[prop];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientAsAny[prop] = (...args: any[]) => {
      debug(`${prop}:`, args);
      return originalFunc.apply(nanoClient, args);
    }
  }
}
