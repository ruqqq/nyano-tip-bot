import dotenv from "dotenv";
dotenv.config();
import { Bot, GrammyError, HttpError, NextFunction, session } from "grammy";
import { NyanoTipBotContext, NyanoTipBotSession } from "./context";
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

bot.use(session<NyanoTipBotSession, NyanoTipBotContext>({ initial: () => ({}) }));
bot.use(BotService.usernameRecorderMiddleware);
bot.use(BotService.startMenu);
bot.use(BotService.withdrawMenu);
bot.command("balance", BotService.handleBalanceCommand);
bot.command("withdraw", BotService.handleWithdrawBalance);
bot.command("tip", BotService.handleMessage);
bot.on("message", wrapNext(BotService.handleMessage));
bot.command("start", BotService.handleStartCommand);

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
  await ctx.reply(
    "A technical error occurred while processing your request. Please try again later.",
    {
      reply_to_message_id: ctx.update.message?.message_id,
    }
  )
});

bot.start();
