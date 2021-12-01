import { Bot } from "grammy";
import { convert, Unit } from "nanocurrency";
import { MnanoContext } from "./context";
import { BusinessErrors } from "./errors";
import { TipService } from "./tip-service";

async function start(ctx: MnanoContext) {
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
    return;
  }

  const payload = ctx.update.message?.text?.replace("/start", "").trim();

  if (payload === "topup") {
    await BotService.getBalance(ctx);
  } else if (payload === "withdraw") {
    await BotService.withdrawBalance(ctx);
  } else {
    ctx.reply(
      `Nano is a cryptocurrency \\- it can be used for real life transaction\\. You can check the fiat value of Nano [here](https://www.coingecko.com/en/coins/nano/sgd)\\.

Tip telegram users by replying to their message and send \\"\\/tip \\<value>\\" where \\<value\\> is the amount you wish to tip\\, e\\.g\\. 0\\.001\\.

MnanoBot holds your balance until you withdraw them to your personal wallet\\. You can get your current balance by using the bot command \\/balance\\.

Despite MnanoBot holding your balance\\, because Nano is a cryptocurrency\\, the ledger is transparent\\. You can view your MnanoBot wallet via the balance command on a block explorer\\. Likewise\\, for every tip that happens\\, it is an actual Nano transaction on-chain and you can view the transaction in the block explorer too\\.

Happy tipping\\!`,
      { parse_mode: "MarkdownV2" }
    );
    await getBalance(ctx);
  }
}

async function handleMessage(ctx: MnanoContext): Promise<void> {
  let text = ctx.update?.message?.text;
  if (text === "/tip") {
    text = "/tip 0.001";
  }
  const matches = text?.match(/^[!/]+tip ([0-9]+(\.[0-9]+)?){1}/);

  if (matches && ctx.update.message) {
    if (!ctx.update.message.reply_to_message) {
      ctx.reply("Reply to a message to tip.")
      return;
    }
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

      if (prevToBalance === 0n) {
        ctx.reply(
          `Congratulations [${to.first_name}](tg://user?id=${to.id}) on your first tip\\! Nano is an actual (crypto)-currency. Click the button below to learn more\\.`,
          {
            parse_mode: "MarkdownV2",
            reply_markup: {
              inline_keyboard: [[{ text: "Learn More", url: `https://t.me/${ctx.me.username}?start` }]],
            },
          }
        );
      }
    } catch (e) {
      if (e === BusinessErrors.INSUFFICIENT_BALANCE) {
        ctx.reply("Insufficient balance\\. Please top\\-up and try again\\.", {
          parse_mode: "MarkdownV2",
          reply_to_message_id: ctx.update.message.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: "Top-up", url: `https://t.me/${ctx.me.username}?start=topup` }]],
          },
        });
      } else {
        throw e;
      }
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
  const topUpUrl = await TipService.getLinkForTopUp(fromId);
  const accountExplorerUrl = await TipService.getLinkForAccount(fromId);

  ctx.reply(`Balance: ${balanceFormatted} NANO\n\nAddress: ${account.address}`, {
    reply_markup: {
      inline_keyboard: [
        [{
          text: "Top-up",
          url: topUpUrl,
        }],
        [{
          text: "Account Explorer",
          url: accountExplorerUrl,
        }],
      ],
    },
  })
}

async function withdrawBalance(ctx: MnanoContext): Promise<void> {
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
    ctx.reply(`DM me (@${ctx.me.username}) privately to withdraw your balance.`)
    return;
  }

  ctx.reply("We are still building this feature. Please try again later.");
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
  start,
  handleMessage,
  getBalance,
  withdrawBalance,
  sendMessageOnTopUp,
};
