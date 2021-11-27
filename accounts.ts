import level from "level";
import { NotFoundError } from "level-errors";

const db = level(
  process.env.DB_FILE ?? "./db",
  { valueEncoding: "json" },
);

type Account = {
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
