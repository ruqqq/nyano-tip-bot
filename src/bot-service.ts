import { convert, Unit } from "nanocurrency";
import { MnanoContext } from "./context";
import { BusinessErrors } from "./errors";
import { TipService } from "./tip-service";

async function handleMessage(ctx: MnanoContext): Promise<void> {
  const matches = ctx.update?.message?.text?.match(/^!tip ([0-9]+(\.[0-9]+)?){1}/);
  if (matches && ctx.update.message && ctx.update.message.reply_to_message) {
    if (!ctx.update.message.from || !ctx.update.message.reply_to_message.from) {
      return;
    }
    const from = ctx.update.message.from;
    const fromId = `${from.id}`;
    const to = ctx.update.message.reply_to_message.from;
    const toId = `${to.id}`;
    const amount = BigInt(convert(matches[1], { from: Unit.NANO, to: Unit.raw }));
    const prevToBalance = await TipService.getBalance(toId);

    try {
      await TipService.tipUser(fromId, toId, amount);
      ctx.reply(`${matches[1]} NANO sent!`, {
        reply_to_message_id: ctx.update.message.message_id,
      });
    } catch (e) {
      if (e === BusinessErrors.INSUFFICIENT_BALANCE) {
        ctx.reply("Insufficient balance. Please top-up and try again.", {
          reply_to_message_id: ctx.update.message.message_id,
        });
      } else {
        throw e;
      }
    }

    if (prevToBalance === 0n) {
      ctx.reply(
        `Congratulations [${to.first_name}](tg://user?id=${to.id}) on your first tip! Click the button below to learn how to withdraw your tip.`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[{ text: "Withdraw", url: "" }]],
          },
        }
      );
    }
  }
}

export const BotService = {
  handleMessage,
};
