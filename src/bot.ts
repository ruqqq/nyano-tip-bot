import dotenv from "dotenv";
dotenv.config();
import { Bot, NextFunction } from "grammy";
import { MnanoContext } from "./context";
import { BotService } from "./bot-service";

function wrapNext(fn: (ctx: MnanoContext) => Promise<void>): (ctx: MnanoContext, next: NextFunction) => Promise<void> {
  return async (ctx, next) => {
    await fn(ctx);
    next();
  };
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const bot = new Bot<MnanoContext>(process.env.BOT_TOKEN!);

bot.command("start", (ctx, next) => {
  if (!ctx.update.message) {
    next();
    return;
  }

  const payload = ctx.update.message?.text.replace("/start", "").trim();
  ctx.reply(`Placeholder. Payload: ${payload}`);
  next();
});
bot.command("balance", wrapNext(BotService.getBalance));
// temp func
bot.command("processPendingBlocks", wrapNext(BotService.processPendingBlocks));

bot.on("message", wrapNext(BotService.handleMessage));

bot.start();
