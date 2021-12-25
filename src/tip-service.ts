import { Account, Accounts } from "./accounts";
import { BusinessErrors } from "./errors";
import { Nano } from "./nano";
import log from "loglevel";
import AwaitLock from "await-lock";
import { ExtendedBlockRepresentation } from "./types";

const NANO_WALLET_SEED = process.env.NANO_WALLET_SEED as string;
if (!NANO_WALLET_SEED) {
  generateAndPrintSeed();
  throw Error(`NANO_WALLET_SEED cannot be empty.`);
}

const txLock: { [address: string]: AwaitLock } = {};

async function acquireTxLock(address: string) {
  if (!txLock[address]) {
    txLock[address] = new AwaitLock();
  }
  await txLock[address].acquireAsync();
}

async function generateAndPrintSeed() {
  const seed = await Nano.generateSeed();
  log.info(`Generated seed: ${seed}`)
}

async function tipUser(
  fromTgUserId: string,
  toTgUserId: string,
  amount: bigint,
) {
  const fromAccount = await getOrCreateAccount(fromTgUserId);
  const toAccount = await getOrCreateAccount(toTgUserId);

  await acquireTxLock(fromAccount.address);

  try {
    const { balance: fromBalance } = await Nano.getBalance(fromAccount.address);
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

    return block.hash;
  } finally {
    txLock[fromAccount.address].release();
  }
}

async function withdrawToAddress(
  fromTgUserId: string,
  toNanoAddress: string,
  amount: bigint,
) {
  const fromAccount = await getOrCreateAccount(fromTgUserId);

  await acquireTxLock(fromAccount.address);

  try {
    const { balance: fromBalance } = await Nano.getBalance(fromAccount.address);
    if (fromBalance - amount < 0n) {
      throw BusinessErrors.INSUFFICIENT_BALANCE;
    }

    const fromKeyMetadata = Nano.extractAccountMetadata(
      Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, fromAccount.seedIndex),
    );

    const { block } = await Nano.send(
      fromKeyMetadata.secretKey,
      toNanoAddress,
      amount,
    );

    return block.hash;
  } finally {
    txLock[fromAccount.address].release();
  }
}

async function getAccount(tgUserId: string) {
  return await getOrCreateAccount(tgUserId);
}

async function processPendingTxs(tgUserId: string) {
  const account = await getOrCreateAccount(tgUserId);
  const { secretKey } = Nano.extractAccountMetadata(
    Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, account.seedIndex)
  );
  return Nano.processPendingBlocks(secretKey);
}

async function getBalance(tgUserId: string): Promise<{balance: bigint, pending: bigint}> {
  const account = await getOrCreateAccount(tgUserId);

  const { secretKey } = Nano.extractAccountMetadata(
    Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, account.seedIndex)
  );
  Nano.processPendingBlocks(secretKey)
  .catch(log.error);

  return await Nano.getBalance(account.address);
}

async function getLinkForTopUp(tgUserId: string): Promise<string> {
  const account = await getOrCreateAccount(tgUserId);
  return `https://paynano.me/${account.address}`;
}

async function getLinkForAccount(tgUserId: string): Promise<string> {
  const account = await getOrCreateAccount(tgUserId);
  return Nano.getAccountExplorerUrl(account.address);
}

function getLinkForBlock(hash: string): string {
  return Nano.getBlockExplorerUrl(hash);
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

type TxStatus = "pending" | "confirmed";

function subscribeToConfirmedTx(cb: {
  onTopUp: (id: string, tgUserId: string, status: TxStatus) => Promise<void>;
  onTip: (id: string, fromTgUserId: string, toTgUserId: string, status: TxStatus) => Promise<void>;
  onWithdraw: (id: string, tgUserId: string) => Promise<void>;
}) {
  function deduceTransactionDetails(
    block: ExtendedBlockRepresentation,
    account1: Account | null,
    account2: Account | null,
  ): {
    action: "tip",
    status: TxStatus,
    sendingAccount: Account,
    receivingAccount: Account,
    id: string,
  } | {
    action: "withdraw",
    status: TxStatus,
    sendingAccount: Account,
    id: string,
  } | {
    action: "topup",
    status: TxStatus,
    receivingAccount: Account,
    id: string,
  } | null {

    if (block.subtype === "send" && account1 && account2) {
      return {
        action: "tip",
        status: "pending",
        sendingAccount: account1,
        receivingAccount: account2,
        id: block.hash,
      }
    } else if (block.subtype === "receive" && account1 && account2) {
      return {
        action: "tip",
        status: "confirmed",
        sendingAccount: account2,
        receivingAccount: account1,
        id: block.link,
      }
    } else if (block.subtype === "send" && account1) {
      return {
        action: "withdraw",
        status: "pending",
        sendingAccount: account1,
        id: block.hash,
      }
    } else if (block.subtype === "receive" && account2) {
      return {
        action: "withdraw",
        status: "confirmed",
        sendingAccount: account2,
        id: block.link,
      }
    } else if (block.subtype === "send" && account2) {
      return {
        action: "topup",
        status: "pending",
        receivingAccount: account2,
        id: block.hash,
      }
    } else if (block.subtype === "receive" && account1) {
      return {
        action: "topup",
        status: "confirmed",
        receivingAccount: account1,
        id: block.link,
      }
    } else {
      return null;
    }
  }
  Nano.subscribeToConfirmations(async (hash, block) => {
    try {
      const account1 = await Accounts.getAccountByAddress(block.account);
      let linkedAccount = block.link_as_account;
      if (block.subtype === "receive" && account1) {
        const result = await Nano.getBlock(hash);
        if (!result || !result.source_account) {
          throw new Error(`Unable to find block (with source account) for id ${hash}`);
        }
        linkedAccount = result.source_account;
      }
      const account2 = await Accounts.getAccountByAddress(linkedAccount);

      const details = deduceTransactionDetails(block, account1, account2);
      if (!details) {
        return;
      }
      const {
        id,
        action,
        status,
      } = details;

      log.info("Block Confirmation:", Nano.getBlockExplorerUrl(hash));
      log.info("Deduced Tx:", details);

      if (status === "pending" && (action === "topup" || action === "tip")) {
        if (action === "tip") {
          cb.onTip(id, details.sendingAccount.tgUserId, details.receivingAccount.tgUserId, details.status);
        } else if (action === "topup") {
          cb.onTopUp(id, details.receivingAccount.tgUserId, details.status);
        }

        const { secretKey } = Nano.extractAccountMetadata(
          Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, details.receivingAccount.seedIndex)
        );
        const results = await Nano.processPendingBlocks(secretKey);
        results.forEach(result => log.info("Received:", Nano.getBlockExplorerUrl(result.block.hash)))
      } else if (status === "confirmed") {
        if (action === "tip") {
          cb.onTip(id, details.sendingAccount.tgUserId, details.receivingAccount.tgUserId, details.status);
        } else if (action === "topup") {
          cb.onTopUp(id, details.receivingAccount.tgUserId, details.status);
        }
      } else if (status === "pending") {
        if (action === "withdraw") {
          cb.onWithdraw(id, details.sendingAccount.tgUserId);
        }
      }
    } catch (e) {
      log.error(e);
    }
  });
}

export const TipService = {
  tipUser,
  withdrawToAddress,
  getAccount,
  getBalance,
  getLinkForTopUp,
  getLinkForAccount,
  getLinkForBlock,
  subscribeToConfirmedTx,
  processPendingTxs,
};
