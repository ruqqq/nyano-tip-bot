
import { BlocksInfoResponseContents, NanoClient } from '@dev-ptera/nano-node-rpc';
import { derivePublicKey, CommonBlockData, OpenBlockData, createBlock, deriveAddress, ReceiveBlockData, SendBlockData, BlockRepresentation, deriveSecretKey } from 'nanocurrency';

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
    representative = (blocks[0].contents as BlocksInfoResponseContents).representative;
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
  const workResult = await workGenerate(block.block.previous ?? publicKey);
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

/* async function processPendingBlocks(secretKey: string) {
  const address = deriveAddress(derivePublicKey(secretKey), { useNanoPrefix: true });
  const pendingResult = await client.accounts_pending([address], 10, { source: true });
  const blocksMap = (pendingResult.blocks[address] ?? {}) as { [key: string]: { amount: string; source: string; } };
  return await Promise.all(
    Object.keys(blocksMap).map(hash => receive(secretKey, hash, BigInt(blocksMap[hash].amount))),
  );
} */

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
  const representatives = Object.keys(result.representatives);
  if (representatives.length === 0) {
    throw new Error("No online representatives found.");
  }
  return representatives[0];
}

export const Nano = {
  getBalance,
  receive,
  send,
  extractAccountMetadata,
  getSecretKeyFromSeed,
  getBlockExplorerUrl,
};
