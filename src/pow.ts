import { NanoClient } from "@dev-ptera/nano-node-rpc";
import AwaitLock from "await-lock";
import log from "loglevel";
import { computeWork } from "nanocurrency";
import { WorkCache } from "./work-cache";

const workGenNodeUrls = process.env.NANO_WORK_GEN_NODE_URLS?.split(",") ?? [];
const workGenClients = workGenNodeUrls.map((url, index) => {
  return new NanoClient({
    url,
    requestHeaders: {
      ...(process.env[`NANO_WORK_GEN_NODE_API_KEY_${index}`] ? {
        "Authorization": process.env[`NANO_WORK_GEN_NODE_API_KEY_${index}`],
      } : {}),
    }
  })
});

const workGenLocks: Record<string, AwaitLock> = {};

async function acquireWorkGenLock(hash: string) {
  if (!workGenLocks[hash]) {
    workGenLocks[hash] = new AwaitLock();
  }
  await workGenLocks[hash].acquireAsync();
}

async function generateAndCacheWork(hash: string) {
  await acquireWorkGenLock(hash);

  try {
    const existingWork = await WorkCache.get(hash);
    if (!existingWork) {
      const workResult = await workGenerate(hash);
      await WorkCache.put(hash, workResult);
      log.info("Cached work for:", hash, workResult.work);
    }
  } catch (e) {
    log.warn("generateAndCacheWork failed:", e);
  } finally {
    workGenLocks[hash].release();
  }
}

async function generateWork(hash: string, difficulty?: string) {
  await acquireWorkGenLock(hash);

  try {
    const cached = await WorkCache.get(hash);
    if (cached) {
      return cached;
    }
  } finally {
    workGenLocks[hash].release();
  }

  return await workGenerate(hash, difficulty);
}

interface WorkGenerateReturn {
  hash: string;
  work: string;
  difficulty: string;
  multiplier: string;
}

async function workGenerate(
  hash: string,
  difficulty = "fffffff800000000",
): Promise<WorkGenerateReturn> {
  const workGenerators = workGenClients
    .map(client => (hash: string, difficulty?: string) => rpcWorkGenerate(client, hash, difficulty));
  workGenerators.sort(() => Math.random() - 0.5);
  workGenerators.push(cpuWorkGenerate);

  for (const workGen of workGenerators) {
    try {
      return await workGen(hash, difficulty);
    } catch (e) {
      log.error(e);
    }
  }

  throw Error(`Unable to generate work for ${hash} at difficulty ${difficulty}`);
}

async function cpuWorkGenerate(
  hash: string,
  difficulty = "fffffff800000000",
): Promise<WorkGenerateReturn> {
  log.info("CPU work_generate:", hash, difficulty);
  const work = await computeWork(hash, {
    workerCount: 4,
    ...(difficulty ? { workThreshold: difficulty } : {}),
  });
  log.info("CPU work_generate result:", hash, work);
  return {
    hash,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    work: work!,
    difficulty,
    multiplier: "",
  };
}

async function rpcWorkGenerate(
  client: NanoClient,
  hash: string,
  difficulty = "fffffff800000000",
): Promise<WorkGenerateReturn> {
  log.info("RPC work_generate:", hash, difficulty, client.nodeAddress);
  const response = await client._send('work_generate', {
    json_block: 'true',
    hash,
    ...(difficulty ? { difficulty } : {}),
  });
  log.info("RPC work_generate result:", response);
  return response;
}

export const Pow = {
  generateWork,
  generateAndCacheWork,
};
