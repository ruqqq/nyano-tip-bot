import dotenv from "dotenv";
import { Bot } from "grammy";
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));
bot.on("message", (ctx) => ctx.reply("Got another message!"));

bot.start();
