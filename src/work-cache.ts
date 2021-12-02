import { workCacheDb } from "./db";
import { NotFoundError } from "level-errors";

async function put(hash: string, value: string): Promise<void> {
  await workCacheDb.put(hash, value);
}

async function get(hash: string): Promise<string | null> {
  try {
    return await workCacheDb.get(hash);
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

async function getKeys(): Promise<string[]> {
  return await new Promise((resolve, reject) => {
    const keys: string[] = [];
    const stream = workCacheDb.createKeyStream();
    stream.on("error", (error) => {
      reject(error);
    });
    stream.on("data", (data) => {
      keys.push(data);
    });
    stream.on("end", () => {
      resolve(keys);
    });
  });
}

export const WorkCache = {
  put,
  get,
  getKeys,
}

