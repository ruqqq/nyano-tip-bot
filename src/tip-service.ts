import { Account, Accounts } from "./accounts";
import { BusinessErrors } from "./errors";
import { Nano } from "./nano";
import log from "loglevel";

const NANO_WALLET_SEED = process.env.NANO_WALLET_SEED as string;
if (!NANO_WALLET_SEED) {
  generateAndPrintSeed();
  throw Error(`NANO_WALLET_SEED cannot be empty.`);
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

  const toKeyMetadata = Nano.extractAccountMetadata(
    Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, toAccount.seedIndex),
  );
  Nano.processPendingBlocks(toKeyMetadata.secretKey);

  return Nano.getBlockExplorerUrl(block.hash);
}

async function withdrawToAddress(
  fromTgUserId: string,
  toNanoAddress: string,
  amount: bigint,
) {
  const fromAccount = await getOrCreateAccount(fromTgUserId);

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

  return Nano.getBlockExplorerUrl(block.hash);
}

async function getAccount(tgUserId: string) {
  return await getOrCreateAccount(tgUserId);
}

async function getBalance(tgUserId: string): Promise<{balance: bigint, pending: bigint}> {
  const account = await getOrCreateAccount(tgUserId);
  const { secretKey } = Nano.extractAccountMetadata(
    Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, account.seedIndex)
  );
  Nano.processPendingBlocks(secretKey);
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

function subscribeToOnReceiveBalance(cb: {
  onTopUp: (tgUserId: string) => Promise<void>;
  onTip: (fromTgUserId: string, toTgUserId: string) => Promise<void>;
}) {
  Nano.subscribeToConfirmations(async (hash, block) => {
    try {
      const sendingAccount = await Accounts.getAccountByAddress(block.account);
      const receivingAccount = await Accounts.getAccountByAddress(block.link_as_account);
      if (receivingAccount) {
        log.info("Confirmed", Nano.getBlockExplorerUrl(hash));
        const { secretKey } = Nano.extractAccountMetadata(
          Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, receivingAccount.seedIndex)
        );
        const results = await Nano.processPendingBlocks(secretKey);
        results.forEach(result => log.info("Received:", Nano.getBlockExplorerUrl(result.block.hash)))
        if (sendingAccount) {
          cb.onTip(sendingAccount.tgUserId, receivingAccount.tgUserId);
        } else {
          cb.onTopUp(receivingAccount.tgUserId);
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
  subscribeToOnReceiveBalance,
};
