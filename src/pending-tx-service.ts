import { pendingTxDb } from "./db";
import { NotFoundError } from "level-errors";
import log from "loglevel";

export type PendingTx = PendingTipTx | PendingWithdrawTx;

export interface PendingTipTx {
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

export interface PendingWithdrawTx {
  sendingTgUserId: string;
  amount: string;
  id: string;
  chatId: string | number;
  messageId: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textParams?: any;
  action: "withdraw";
}

async function put(
  id: string,
  value: PendingTx,
): Promise<void> {
  log.info(`[PendingTxService] Putting ${id}:`, value);
  await pendingTxDb.put(id, value);
}

async function get(
  id: string
): Promise<PendingTx | null> {
  try {
    log.info(`[PendingTxService] Getting ${id}...`);
    const tx = await pendingTxDb.get(id);
    log.info("[PendingTxService] Result:", tx);
    return tx;
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    log.info("[PendingTxService] Result: null");
    return null;
  }
}

async function del(
  id: string
): Promise<void> {
  log.info(`[PendingTxService] Deleting ${id}`);
  await pendingTxDb.del(id);
}

export const PendingTxService = {
  put,
  get,
  del,
}

