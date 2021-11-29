import dotenv from "dotenv";
dotenv.config();
import { Bot } from "grammy";
import { Menu } from "@grammyjs/menu";
import { MnanoContext } from "./context";
import { BotService } from "./bot-service";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const bot = new Bot<MnanoContext>(process.env.BOT_TOKEN!);

const tipMenu: Menu = new Menu("tip-menu")
  .text("Top Up", (ctx) => ctx.reply("You pressed A!")).row()
  .text("Check Balance", (ctx) => ctx.reply("You pressed B!"));
bot.use(tipMenu);

bot.command("start", async (ctx) => {
  await ctx.reply("Check out this menu:", { reply_markup: tipMenu });
});
bot.on("message", BotService.handleMessage);

bot.start();
