import { pendingTxDb } from "./db";
import { NotFoundError } from "level-errors";

export interface PendingTx {
  sendingTgUserId: string;
  receivingTgUserId: string;
  amount: string;
  id: string;
  chatId: string | number;
  messageId: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textParams?: any;
  action: "tip";
}

async function put(
  id: string,
  value: PendingTx,
): Promise<void> {
  await pendingTxDb.put(id, value);
}

async function get(
  id: string
): Promise<PendingTx | null> {
  try {
    return await pendingTxDb.get(id);
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

async function del(
  id: string
): Promise<void> {
  await pendingTxDb.del(id);
}

export const PendingTxService = {
  put,
  get,
  del,
}

