import AwaitLock from "await-lock";
import { NotFoundError } from "level-errors";
import { db } from "./db";
import log from "loglevel";

export type Account = {
  tgUserId: string;
  seedIndex: number;
  address: string;
  withdrawalAddress: null | string;
  hasInteractedWithBot: boolean;
}

const lastSeedIndexLock = new AwaitLock();
const START_SEED_INDEX = 1001;

async function getAccountByTgUserId(tgUserId: string): Promise<Account | null> {
  try {
    const result = await db.get(`tg-${tgUserId}`);
    return {
      ...result,
      hasInteractedWithBot: result.hasInteractedWithBot ?? false,
    }
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

async function getAccountByAddress(address: string): Promise<Account | null> {
  try {
    const result = await db.get(`address-${address}`);
    return {
      ...result,
      hasInteractedWithBot: result.hasInteractedWithBot ?? false,
    }
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

async function getAndIncrementLastSeedIndex(): Promise<number> {
  await lastSeedIndexLock.acquireAsync();
  let index;
  try {
    try {
      index = await db.get("last-seed-index");
    } catch (e) {
      if (!(e instanceof NotFoundError)) {
        throw e;
      }
    }
    if (!index) {
      index = START_SEED_INDEX;
    }
    await db.put("last-seed-index", index + 1);
  } finally {
    lastSeedIndexLock.release();
  }

  return index;
}

async function saveAccount(account: Account): Promise<void> {
  const existingAccount = await getAccountByTgUserId(account.tgUserId);
  try {
    await db.put(`tg-${account.tgUserId}`, account);
    await db.put(`address-${account.address}`, account);
  } catch(e) {
    try {
      await db.del(`tg-${account.tgUserId}`);
      await db.del(`address-${account.address}`);
      if (existingAccount) {
        await db.put(`tg-${existingAccount.tgUserId}`, existingAccount);
        await db.put(`address-${existingAccount.address}`, existingAccount);
      }
    } catch (e) {
      log.warn(e);
    }
    throw e;
  }
}

export const Accounts = {
  getAccountByTgUserId,
  getAccountByAddress,
  saveAccount,
  getAndIncrementLastSeedIndex,
}
