import { Bot } from "grammy";
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
    if (ctx.update.message.from.is_bot) {
      return;
    }
    if (ctx.update.message.reply_to_message.from.is_bot) {
      return;
    }
    const from = ctx.update.message.from;
    const fromId = `${from.id}`;
    const to = ctx.update.message.reply_to_message.from;
    const toId = `${to.id}`;
    const amount = BigInt(convert(matches[1], { from: Unit.NANO, to: Unit.raw }));
    const prevToBalance = await TipService.getBalance(toId);

    try {
      const url = await TipService.tipUser(fromId, toId, amount);
      ctx.reply(`[${matches[1].replace(/\./, "\\.")}](${url}) NANO sent\\!`, {
        parse_mode: "MarkdownV2",
        reply_to_message_id: ctx.update.message.message_id,
      });
    } catch (e) {
      if (e === BusinessErrors.INSUFFICIENT_BALANCE) {
        ctx.reply("Insufficient balance\\. Please top\\-up and try again\\.", {
          reply_to_message_id: ctx.update.message.message_id,
        });
      } else {
        throw e;
      }
    }

    if (prevToBalance === 0n) {
      ctx.reply(
        `Congratulations [${to.first_name}](tg://user?id=${to.id}) on your first tip\\! Click the button below to learn how to withdraw your tip\\.`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[{ text: "Withdraw", url: `https://t.me/${ctx.me.username}?start=withdraw` }]],
          },
        }
      );
    }
  }
}

async function getBalance(ctx: MnanoContext): Promise<void> {
  if (!ctx.update.message) {
    return;
  }
  if (!ctx.update.message.from) {
    return;
  }
  if (ctx.update.message.from.is_bot) {
    return;
  }

  if (ctx.update.message.chat.type !== "private") {
    ctx.reply(`DM me (@${ctx.me.username}) privately to check your balance.`)
    return;
  }

  const from = ctx.update.message.from;
  const fromId = `${from.id}`;
  const account = await TipService.getAccount(fromId);
  const balance = await TipService.getBalance(fromId);
  const balanceFormatted = convert(balance.toString(), {
    from: Unit.raw,
    to: Unit.NANO,
  });
  const url = await TipService.getLinkForTopUp(fromId);

  ctx.reply(`Balance: ${balanceFormatted} NANO\n\nAddress: ${account.address}`, {
    reply_markup: {
      inline_keyboard: [
        [{
          text: "Top-up",
          url,
        }],
      ],
    },
  })
}

function sendMessageOnTopUp(bot: Bot<MnanoContext>) {
  TipService.subscribeToOnReceiveBalance({
    onTip: async (fromTgUserId, toTgUserId) => {
      const balance = await TipService.getBalance(toTgUserId);
      const balanceFormatted = convert(balance.toString(), {
        from: Unit.raw,
        to: Unit.NANO,
      });

      bot.api.sendMessage(
        toTgUserId,
        `Received tip! New balance: ${balanceFormatted} NANO`
      );
    },
    onTopUp: async (tgUserId) => {
      const balance = await TipService.getBalance(tgUserId);
      const balanceFormatted = convert(balance.toString(), {
        from: Unit.raw,
        to: Unit.NANO,
      });

      bot.api.sendMessage(
        tgUserId,
        `Received top-up to balance! New balance: ${balanceFormatted} NANO`
      );
    }
  });
}

export const BotService = {
  handleMessage,
  getBalance,
  sendMessageOnTopUp,
};
