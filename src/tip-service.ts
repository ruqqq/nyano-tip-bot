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

// temp func
async function processReceiveForUser(tgUserId: string) {
  const account = await getOrCreateAccount(tgUserId);
  const secretKey = Nano.getSecretKeyFromSeed(NANO_WALLET_SEED, account.seedIndex);
  return await Nano.processPendingBlocks(secretKey);
}

export const TipService = {
  tipUser,
  getAccount,
  getBalance,
  getLinkForTopUp,
  processReceiveForUser,
};
