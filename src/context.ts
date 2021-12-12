import { Context, SessionFlavor } from "grammy";

export type NyanoTipBotContext = Context & SessionFlavor<NyanoTipBotSession>;

export interface NyanoTipBotSession {
  withdrawalSession?: {
    fromUserId: string;
    toAddress: string;
    amount: string;
  };
};
