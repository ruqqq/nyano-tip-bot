import dotenv from "dotenv";
dotenv.config();
import { Bot } from "grammy";
import { MnanoContext } from "./context";
import { BotService } from "./bot-service";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const bot = new Bot<MnanoContext>(process.env.BOT_TOKEN!);

bot.on("message", BotService.handleMessage);

bot.start();
