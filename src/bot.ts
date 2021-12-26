import dotenv from "dotenv";
dotenv.config();
import { Bot, NextFunction, session } from "grammy";
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
bot.command("start", BotService.handleStartCommand);
bot.command("help", BotService.handleStartCommand);
bot.on("message", wrapNext(BotService.handleMessage));
bot.hears(/^\//, BotService.handleUnknownCommand);

BotService.sendMessageOnTopUp(bot);

bot.catch(BotService.handleError);

bot.start();
