
import { AccountInfoResponse, NanoClient } from '@dev-ptera/nano-node-rpc';
import AwaitLock from 'await-lock';
import {
  derivePublicKey,
  CommonBlockData,
  OpenBlockData,
  createBlock,
  deriveAddress,
  ReceiveBlockData,
  SendBlockData,
  BlockRepresentation,
  deriveSecretKey,
  generateSeed,
} from "nanocurrency";
import ReconnectingWebSocket from "reconnecting-websocket";
import WS from "ws";
import log from "loglevel";
import { WorkCache } from './work-cache';

const client = new NanoClient({
  url: process.env.NANO_NODE_URL,
  requestHeaders: {
    ...(process.env.NANO_NODE_API_KEY ? {
      "Authorization": process.env.NANO_NODE_API_KEY,
    } : {}),
  }
});

async function getBalance(address: string): Promise<{balance: bigint, pending: bigint}> {
  const result = await client.account_balance(address);
  return {
    balance: BigInt(result.balance),
    pending: BigInt(result.pending),
  }
}

async function receive(
  secretKey: string,
  fromBlock: string,
  amount: bigint,
) {
  const { address, publicKey } = extractAccountMetadata(secretKey);
  let accountInfo: AccountInfoResponse | null = null;
  try {
    accountInfo = await client.account_info(address, { representative: true });
  } catch (e) {
    if ((e as Error).message.indexOf("Account not found") < 0) {
      throw e;
    }
  }

  let representative = "";
  if (accountInfo && accountInfo.representative) {
    representative = accountInfo.representative;
  }
  if (!representative) {
    representative = await getMostRecentOnlineRepresentative();
  }
  const balance = accountInfo?.balance ?? "0";
  const receiveBlockData: CommonBlockData & (OpenBlockData | ReceiveBlockData) = {
    work: null,
    balance: (BigInt(balance) + amount).toString(),
    representative,
    previous: accountInfo?.frontier ?? null,
    link: fromBlock,
  };

  const block = createBlock(secretKey, receiveBlockData);
  const workResult = await generateWork(accountInfo?.frontier ?? publicKey, "fffffe0000000000");
  block.block.work = workResult.work;
  const sendResult = await processBlock(block.block, block.block.previous ? 'receive' : 'open');

  generateAndCacheWork(block.hash);

  return {
    block,
    sendResult,
  };
}

async function send(
  secretKey: string,
  toAddress: string,
  amount: bigint,
) {
  const { address } = extractAccountMetadata(secretKey);
  const accountInfo = await client.account_info(address, { representative: true });
  const sendBlockData: CommonBlockData & SendBlockData = {
    work: null,
    balance: (BigInt(accountInfo.balance) - amount).toString(),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    representative: accountInfo.representative!,
    previous: accountInfo.frontier,
    link: toAddress,
  };

  const block = createBlock(secretKey, sendBlockData);
  const workResult = await generateWork(block.block.previous);
  block.block.work = workResult.work;
  const sendResult = await processBlock(block.block, 'send');

  generateAndCacheWork(block.hash);

  return {
    block,
    sendResult,
  };
}

const workGenLock: AwaitLock = new AwaitLock();

async function generateAndCacheWork(hash: string) {
  await workGenLock.acquireAsync();

  try {
    const existingWork = await WorkCache.get(hash);
    if (!existingWork) {
      const workResult = await workGenerate(hash);
      await WorkCache.put(hash, workResult);
      log.info("Cached work for:", hash, workResult);
    }
  } catch (e) {
    log.warn("generateAndCacheWork failed:", e);
  } finally {
    workGenLock.release();
  }
}

function extractAccountMetadata(secretKey: string) {
  const publicKey = derivePublicKey(secretKey);
  const address = deriveAddress(publicKey, { useNanoPrefix: true });

  return {
    publicKey,
    secretKey,
    address,
  }
}

function getSecretKeyFromSeed(seed: string, index: number): string {
  return deriveSecretKey(seed, index);
}

function getBlockExplorerUrl(hash: string): string {
  return `https://nanocrawler.cc/explorer/block/${hash}`;
}

function getAccountExplorerUrl(address: string): string {
  return `https://nanocrawler.cc/explorer/account/${address}`;
}

const processPendingBlocksLocks: Record<string, AwaitLock> = {};

async function processPendingBlocks(secretKey: string) {
  const { address } = extractAccountMetadata(secretKey);
  if (!processPendingBlocksLocks[address]) {
    processPendingBlocksLocks[address] = new AwaitLock();
  }
  await processPendingBlocksLocks[address].acquireAsync();

  try {
    const pendingResult = await client.accounts_pending([address], 10, { source: true });
    const blocksMap = (pendingResult.blocks[address] ?? {}) as { [key: string]: { amount: string; source: string; } };
    const results = [];
    for (const hash of Object.keys(blocksMap)) {
      log.info(`Creating receive block ${hash} for ${address}`);
      const result = await receive(secretKey, hash, BigInt(blocksMap[hash].amount));
      log.info(`Created receive block ${hash} for ${address}`);
      results.push(result);
    }
    return results;
  } finally {
    processPendingBlocksLocks[address].release();
  }
}

async function generateWork(hash: string, difficulty?: string) {
  await workGenLock.acquireAsync();

  try {
    const cached = await WorkCache.get(hash);
    if (cached) {
      return cached;
    }
  } finally {
    workGenLock.release();
  }

  return await workGenerate(hash, difficulty);
}

async function workGenerate(hash: string, difficulty?: string): Promise<{
  hash: string;
  work: string;
  difficulty: string;
  multiplier: string;
}> {
  log.info("work_generate:", hash, difficulty);
  const response = await client._send('work_generate', {
    json_block: 'true',
    hash,
    ...(difficulty ? { difficulty } : {}),
  });
  return response;
}

async function processBlock(block: BlockRepresentation, subtype: 'send' | 'receive' | 'open') {
  const response = await client._send('process', {
    json_block: 'true',
    subtype,
    block,
  });
  return response;
}

async function getMostRecentOnlineRepresentative(): Promise<string> {
  const result = await client.representatives_online();
  const representatives = result.representatives as string[];
  if (representatives.length === 0) {
    throw new Error("No online representatives found.");
  }
  return representatives[0];
}

function subscribeToConfirmations(cb: (hash: string, block: BlockRepresentation) => Promise<void>) {
  if (!process.env.NANO_NODE_WS_URL) {
    throw new Error("NANO_NODE_WS_URL env not specified!");
  }

  const ws = new ReconnectingWebSocket(process.env.NANO_NODE_WS_URL, [], {
    WebSocket: WS,
    connectionTimeout: 1000,
    maxRetries: 100000,
    maxReconnectionDelay: 2000,
    minReconnectionDelay: 10 // if not set, initial connection will take a few seconds by default
  });

  ws.addEventListener("open", () => {
    const confirmation_subscription = {
      "action": "subscribe",
      "topic": "confirmation",
    };
    ws.send(JSON.stringify(confirmation_subscription));
    log.info("Listening to confirmations...")
  });

  ws.addEventListener("error", (error) => {
    if (error.message.indexOf("TIMEOUT") === -1) {
      log.warn(error.error);
    }
  });

  ws.addEventListener("message", (msg) => {
    const data_json = JSON.parse(msg.data);

    if (data_json.topic === "confirmation" && data_json.message.block.subtype === "send") {
      cb(data_json.message.hash, data_json.message.block);
    }
  });

  return ws;
}


export const Nano = {
  getBalance,
  receive,
  send,
  extractAccountMetadata,
  getSecretKeyFromSeed,
  getBlockExplorerUrl,
  getAccountExplorerUrl,
  generateSeed,
  processPendingBlocks,
  subscribeToConfirmations,
};
