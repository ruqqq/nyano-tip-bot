import dotenv from "dotenv";
dotenv.config();
import { Bot, GrammyError, HttpError, NextFunction } from "grammy";
import { MnanoContext } from "./context";
import { BotService } from "./bot-service";
import log from "loglevel";

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
bot.command("withdraw", (ctx, next) => {
  ctx.reply("Placeholder. Please try again later.");
  next();
});

bot.on("message", wrapNext(BotService.handleMessage));

BotService.sendMessageOnTopUp(bot);

bot.catch((err) => {
  const ctx = err.ctx;
  log.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    log.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    log.error("Could not contact Telegram:", e);
  } else {
    log.error("Unknown error:", e);
  }
});

bot.start();
