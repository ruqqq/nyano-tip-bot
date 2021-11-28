import AwaitLock from "await-lock";
import { NotFoundError } from "level-errors";
import { db } from "./db";

export type Account = {
  tgUserId: string;
  seedIndex: number;
  address: string;
  withdrawalAddress: null | string;
}

const lastSeedIndexLock = new AwaitLock();

async function getAccountByTgUserId(tgUserId: string): Promise<Account | null> {
  try {
    return await db.get(`tg-${tgUserId}`);
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

async function getAccountByAddress(address: string): Promise<Account | null> {
  try {
    return await db.get(`address-${address}`);
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
      index = 1;
    }
    await db.put("last-seed-index", index + 1);
  } finally {
    lastSeedIndexLock.release();
  }

  return index;
}

async function saveAccount(account: Account): Promise<void> {
  try {
    await db.put(`tg-${account.tgUserId}`, account);
    await db.put(`address-${account.address}`, account);
  } catch(e) {
    try {
      await db.del(`tg-${account.tgUserId}`);
      await db.del(`address-${account.address}`);
    } catch (e) {
      console.warn(e);
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
