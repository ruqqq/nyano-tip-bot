import { NotFoundError } from "level-errors";
import { db } from "./db";

export type Account = {
  tgUserId: string;
  seedIndex: number;
  address: string;
  withdrawalAddress: null | string;
}

export async function getAccountByTgUserId(tgUserId: string): Promise<Account | null> {
  try {
    return await db.get(`tg-${tgUserId}`);
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

export async function getAccountByAddress(address: string): Promise<Account | null> {
  try {
    return await db.get(`address-${address}`);
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}
