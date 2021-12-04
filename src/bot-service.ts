import { Bot } from "grammy";
import { convert, Unit } from "nanocurrency";
import { MnanoContext } from "./context";
import { BusinessErrors } from "./errors";
import { TipService } from "./tip-service";
import log from "loglevel";

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

  log.info(`${ctx.update.message.from.id} requested /start ${payload}`);

  if (payload === "topup") {
    await BotService.getBalance(ctx);
  } else if (payload === "withdraw") {
    await BotService.withdrawBalance(ctx);
  } else {
    await ctx.reply(
      `Nano is a cryptocurrency \\- it can be used for real life transactions\\. You can check the fiat value of Nano [here](https://www.coingecko.com/en/coins/nano/sgd)\\. Nyano is just a smaller unit representation of Nano\\.

Tip telegram users by replying to their message and send \\"\\/tip \\<value\\>\\" where \\<value\\> is the amount you wish to tip\\, e\\.g\\. 0\\.001\\.

NyanoTipBot holds your balance until you withdraw them to your personal wallet\\. You can get your current balance by using the bot command \\/balance\\.

Despite NyanoTipBot holding your balance\\, because Nano is a cryptocurrency\\, the ledger is transparent\\. You can view your MnanoBot wallet via the balance command on a block explorer\\. Likewise\\, for every tip that happens\\, it is an actual Nano transaction on\\-chain and you can view the transaction in the block explorer too\\.

Happy tipping\\!`,
      { parse_mode: "MarkdownV2" }
    );
    await getBalance(ctx);
  }
}

async function handleMessage(ctx: MnanoContext): Promise<void> {
  const text = " " + ctx.update?.message?.text + " ";
  const matchesOnStart = text?.match(/^ \/tip(\s[0-9]+(\.[0-9]+)?)? $/);
  const matchesInBetween = text?.match(/ !tip(\s[0-9]+(\.[0-9]+)?)? /);
  const matches = matchesOnStart || matchesInBetween;
  const amountString =
    (((matchesOnStart && matchesOnStart[1]) ||
    (matchesInBetween && matchesInBetween[1])) ?? "10").trim();

  if (matches && ctx.update.message) {
    if (!ctx.update.message.reply_to_message) {
      await ctx.reply("Reply to a message to tip.")
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
    if (ctx.update.message.from.id === ctx.update.message.reply_to_message.from.id) {
      await ctx.reply("Try tipping other people instead.")
      return;
    }

    const from = ctx.update.message.from;
    const fromId = `${from.id}`;
    const to = ctx.update.message.reply_to_message.from;
    const toId = `${to.id}`;
    const amount = BigInt(convert(amountString, { from: Unit.nano, to: Unit.raw }));
    const { balance: prevToBalance } = await TipService.getBalance(toId);

    log.info(`${fromId} sending tip to ${toId}`);

    try {
      const msg = await ctx.reply(`Sending ${amountString.replace(/\./, "\\.")} nyano to [${to.first_name}](tg://user?id=${to.id})\\!`, {
        parse_mode: "MarkdownV2",
        reply_to_message_id: ctx.update.message.message_id,
      });
      const url = await TipService.tipUser(fromId, toId, amount);
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `[${amountString.replace(/\./, "\\.")}](${url}) nyano sent to [${
          to.first_name
        }](tg://user?id=${to.id})\\!`,
        {
          parse_mode: "MarkdownV2",
        }
      );

      if (prevToBalance === 0n) {
        await ctx.reply(
          `Congratulations [${to.first_name}](tg://user?id=${to.id}) on your first tip\\! Nano is an actual cryptocurrency\\. Click the button below to learn more\\.`,
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
        await ctx.reply("Insufficient balance\\. Please top\\-up and try again\\.", {
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
    await ctx.reply(`DM me (@${ctx.me.username}) privately to check your balance.`)
    return;
  }

  log.info(`${ctx.update.message.from.id} requested /balance`);

  const from = ctx.update.message.from;
  const fromId = `${from.id}`;
  const account = await TipService.getAccount(fromId);
  const { balance, pending } = await TipService.getBalance(fromId);
  const balanceFormatted = convert(balance.toString(), {
    from: Unit.raw,
    to: Unit.nano,
  });
  const balanceFormattedNano = convert(balance.toString(), {
    from: Unit.raw,
    to: Unit.NANO,
  });
  const pendingFormatted = convert(pending.toString(), {
    from: Unit.raw,
    to: Unit.nano,
  });
  const pendingFormattedNano = convert(pending.toString(), {
    from: Unit.raw,
    to: Unit.NANO,
  });
  const topUpUrl = await TipService.getLinkForTopUp(fromId);
  const accountExplorerUrl = await TipService.getLinkForAccount(fromId);

  await ctx.reply(`Balance: ${balanceFormatted} nyano (${balanceFormattedNano} NANO)\nPending: ${pendingFormatted} nyano (${pendingFormattedNano} NANO)\n\nAddress: ${account.address}`, {
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
    await ctx.reply(`DM me (@${ctx.me.username}) privately to withdraw your balance.`)
    return;
  }

  await ctx.reply("We are still building this feature. Please try again later.");
}

function sendMessageOnTopUp(bot: Bot<MnanoContext>) {
  TipService.subscribeToOnReceiveBalance({
    onTip: async (fromTgUserId, toTgUserId) => {
      const { balance, pending } = await TipService.getBalance(toTgUserId);
      const balanceFormatted = convert(balance.toString(), {
        from: Unit.raw,
        to: Unit.nano,
      });
      const pendingFormatted = convert(pending.toString(), {
        from: Unit.raw,
        to: Unit.nano,
      });

      try {
        await bot.api.sendMessage(
          toTgUserId,
          `You just received a tip! New balance: ${balanceFormatted} nyano (Pending: ${pendingFormatted} nyano)`
        );
      } catch (e) {
        log.warn(e);
      }
    },
    onTopUp: async (tgUserId) => {
      const { balance, pending } = await TipService.getBalance(tgUserId);
      const balanceFormatted = convert(balance.toString(), {
        from: Unit.raw,
        to: Unit.nano,
      });
      const pendingFormatted = convert(pending.toString(), {
        from: Unit.raw,
        to: Unit.nano,
      });

      try {
        await bot.api.sendMessage(
          tgUserId,
          `Received top-up to balance! New balance: ${balanceFormatted} nyano (Pending: ${pendingFormatted} nyano)`
        );
      } catch (e) {
        log.warn(e);
      }
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
