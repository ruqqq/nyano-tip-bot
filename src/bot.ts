import dotenv from "dotenv";
dotenv.config();
import { Bot, GrammyError, HttpError, NextFunction } from "grammy";
import { NyanoTipBotContext } from "./context";
import { BotService } from "./bot-service";
import log from "loglevel";
log.setDefaultLevel(process.env.LOG_LEVEL as any ?? "INFO");

function wrapNext(fn: (ctx: NyanoTipBotContext) => Promise<void>): (ctx: NyanoTipBotContext, next: NextFunction) => Promise<void> {
  return async (ctx, next) => {
    await fn(ctx);
    await next();
  };
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const bot = new Bot<NyanoTipBotContext>(process.env.BOT_TOKEN!);

bot.use(BotService.usernameRecorderMiddleware);
bot.command("start", BotService.start);
bot.command("balance", BotService.getBalance);
bot.command("withdraw", BotService.withdrawBalance);
bot.command("tip", BotService.handleMessage);

bot.on("message", wrapNext(BotService.handleMessage));

BotService.sendMessageOnTopUp(bot);

bot.catch(async (err) => {
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
  await ctx.reply("A technical error occurred while processing your request. Please try again later.")
});

bot.start();
