import { BlockRepresentation } from "nanocurrency";
import ReconnectingWebSocket from "reconnecting-websocket";
import WS from "ws";
import { Account, Accounts } from "./accounts";
import { BusinessErrors } from "./errors";
import { Nano } from "./nano";

const NANO_WALLET_SEED = process.env.NANO_WALLET_SEED as string;
if (!NANO_WALLET_SEED) {
  generateAndPrintSeed();
  throw Error(`NANO_WALLET_SEED cannot be empty.`);
}

async function generateAndPrintSeed() {
  const seed = await Nano.generateSeed();
  console.log(`Generated seed: ${seed}`)
}

async function tipUser(
  fromTgUserId: string,
  toTgUserId: string,
  amount: bigint,
) {
  const fromAccount = await getOrCreateAccount(fromTgUserId);
  const toAccount = await getOrCreateAccount(toTgUserId);

  const fromBalance = await Nano.getBalance(fromAccount.address);
  if (fromBalance - amount < 0n) {
    throw BusinessErrors.INSUFFICIENT_BALANCE;
  }

  const fromKeyMetadata = Nano.extractAccountMetadata(
    Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, fromAccount.seedIndex),
  );

  const { block } = await Nano.send(
    fromKeyMetadata.secretKey,
    toAccount.address,
    amount,
  );

  return Nano.getBlockExplorerUrl(block.hash);
}

async function getAccount(tgUserId: string) {
  return await getOrCreateAccount(tgUserId);
}

async function getBalance(tgUserId: string): Promise<bigint> {
  const account = await getOrCreateAccount(tgUserId);
  return await Nano.getBalance(account.address);
}

async function getLinkForTopUp(tgUserId: string): Promise<string> {
  const account = await getOrCreateAccount(tgUserId);
  return `https://paynano.me/${account.address}?amount=0.001`;
}

async function getOrCreateAccount(tgUserId: string): Promise<Account> {
  let account = await Accounts.getAccountByTgUserId(tgUserId);
  if (!account) {
    const seedIndex = (await Accounts.getAndIncrementLastSeedIndex()) + 1;
    const { address } = Nano.extractAccountMetadata(
      Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, seedIndex),
    );
    account = {
      tgUserId,
      seedIndex,
      address,
      withdrawalAddress: null,
    };
    await Accounts.saveAccount(account);
  }

  return account;
}

function subscribeToConfirmations(cb: (tgUserId: string) => Promise<void>) {
  async function processConfirmedSendBlock(receivingAddress: string, block: BlockRepresentation) {
    try {
      const account = await Accounts.getAccountByAddress(receivingAddress)
      if (account) {
        console.log('Confirmed', block);
        const { secretKey } = Nano.extractAccountMetadata(
          Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, account.seedIndex),
        );
        const results = await Nano.processPendingBlocks(secretKey)
        console.log("Received:", results);
        cb(account.tgUserId);
      }
    } catch (e) {
      console.error(e);
    }
  }

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
    console.warn(error.error);
  });

  ws.addEventListener("message", (msg) => {
    const data_json = JSON.parse(msg.data);

    if (data_json.topic === "confirmation" && data_json.message.block.subtype === "send") {
      const receivingAddress = data_json.message.block.link_as_account;
      processConfirmedSendBlock(receivingAddress, data_json.message.block);
    }
  });

  return ws;
}


export const TipService = {
  tipUser,
  getAccount,
  getBalance,
  getLinkForTopUp,
  subscribeToConfirmations,
};
