
import { BlocksInfoResponseContents, NanoClient } from '@dev-ptera/nano-node-rpc';
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

const client = new NanoClient({
  url: process.env.NANO_NODE_URL,
  requestHeaders: {
    ...(process.env.NANO_NODE_API_KEY ? {
      "Authorization": process.env.NANO_NODE_API_KEY,
    } : {}),
  }
});

async function getBalance(address: string): Promise<bigint> {
  const result = await client.account_balance(address);
  return BigInt(result.balance);
}

async function receive(
  secretKey: string,
  fromBlock: string,
  amount: bigint,
) {
  const { address, publicKey } = extractAccountMetadata(secretKey);
  const previous = await getAccountFrontier(address);
  let representative = "";
  if (previous) {
    const { blocks } = await client.blocks_info([previous], { json_block: true });
    representative = (blocks[previous].contents as BlocksInfoResponseContents).representative;
  }
  if (!representative) {
    representative = await getMostRecentOnlineRepresentative();
  }
  const balanceResponse = await client.account_balance(address);
  const receiveBlockData: CommonBlockData & (OpenBlockData | ReceiveBlockData) = {
    work: null,
    balance: (BigInt(balanceResponse.balance) + amount).toString(),
    representative,
    previous,
    link: fromBlock,
  };

  const block = createBlock(secretKey, receiveBlockData);
  const workResult = await workGenerate(previous ?? publicKey);
  block.block.work = workResult.work;
  const sendResult = await processBlock(block.block, block.block.previous ? 'receive' : 'open');

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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const previous = (await getAccountFrontier(address))!;
  const { blocks } = await client.blocks_info([previous], { json_block: true });
  const representative = (blocks[0].contents as BlocksInfoResponseContents).representative;
  const balanceResponse = await client.account_balance(address);
  const sendBlockData: CommonBlockData & SendBlockData = {
    work: null,
    balance: (BigInt(balanceResponse.balance) - amount).toString(),
    representative,
    previous,
    link: toAddress,
  };

  const block = createBlock(secretKey, sendBlockData);
  const workResult = await workGenerate(block.block.previous);
  block.block.work = workResult.work;
  const sendResult = await processBlock(block.block, 'send');

  return {
    block,
    sendResult,
  };
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
      const result = await receive(secretKey, hash, BigInt(blocksMap[hash].amount));
      results.push(result);
    }
    return results;
  } finally {
    processPendingBlocksLocks[address].release();
  }
}

async function workGenerate(hash: string) {
  const response = await client._send('work_generate', {
    json_block: 'true',
    hash,
  });
  return response;
}

async function getAccountFrontier(address: string) {
  const result = await client.accounts_frontiers([address]);
  if (result.frontiers[address]) {
    return result.frontiers[address];
  }

  return null;
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

function subscribeToConfirmations(cb: (block: BlockRepresentation) => Promise<void>) {
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
      "ack": true,
    };
    ws.send(JSON.stringify(confirmation_subscription));
  });

  ws.addEventListener("error", (error) => {
    if (error.message.indexOf("TIMEOUT") === -1) {
      console.warn(error.error);
    }
  });

  ws.addEventListener("message", (msg) => {
    const data_json = JSON.parse(msg.data);

    if (data_json.topic === "confirmation" && data_json.message.block.subtype === "send") {
      cb(data_json.message.block);
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
  generateSeed,
  processPendingBlocks,
  subscribeToConfirmations,
};
