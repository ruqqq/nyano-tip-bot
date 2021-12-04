import { Bot, NextFunction } from "grammy";
import { convert, Unit } from "nanocurrency";
import { NyanoTipBotContext } from "./context";
import { BusinessErrors } from "./errors";
import { TipService } from "./tip-service";
import log from "loglevel";
import { User } from "@grammyjs/types";
import { TgUsernameMapperService } from "./tg-username-mapper-service";

async function usernameRecorderMiddleware(ctx: NyanoTipBotContext, next: NextFunction) {
  const from = ctx.update.message?.from;
  if (from?.username) {
    await TgUsernameMapperService.put(from.username, from.id);
  }
  await next();
}

async function start(ctx: NyanoTipBotContext) {
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

Despite NyanoTipBot holding your balance\\, because Nano is a cryptocurrency\\, the ledger is transparent\\. You can view your NyanoTipBot wallet via the balance command on a block explorer\\. Likewise\\, for every tip that happens\\, it is an actual Nano transaction on\\-chain and you can view the transaction in the block explorer too\\.

Happy tipping\\!`,
      { parse_mode: "MarkdownV2" }
    );
    await getBalance(ctx);
  }
}

async function handleMessage(ctx: NyanoTipBotContext): Promise<void> {
  if (!ctx.update.message || !ctx.update.message.text) {
    return;
  }

  const text = " " + ctx.update?.message?.text + " ";
  const matchesOnStart = text?.match(/^ \/tip(\s[0-9]+(\.[0-9]+)?)? /);
  const matchesInBetween = text?.match(/ !tip(\s[0-9]+(\.[0-9]+)?)? /);
  const matches = matchesOnStart || matchesInBetween;
  const amountString =
    (((matchesOnStart && matchesOnStart[1]) ||
    (matchesInBetween && matchesInBetween[1])) ?? "10").trim();

  if (matches) {
    if (!ctx.update.message.from) {
      return;
    }

    if (ctx.update.message.from.is_bot) {
      return;
    }

    const from = ctx.update.message.from;
    const fromId = `${from.id}`;
    const mentionEntities =
      ctx.update.message.entities?.filter(entity => ['mention', 'text_mention'].includes(entity.type)) || [];

    if (
      (!ctx.update.message.reply_to_message ||
        !ctx.update.message.reply_to_message.from) &&
      mentionEntities.length !== 1
    ) {
      await ctx.reply("Reply to a message or mention a user to tip. Multiple mentions are not supported.");
      return;
    }

    let to: User;
    if (ctx.update.message.reply_to_message?.from) {
      to = ctx.update.message.reply_to_message.from;
    } else if (mentionEntities[0].type === "text_mention") {
      const entity = mentionEntities[0];
      to = entity.user;
    } else if (mentionEntities[0].type === "mention") {
      const entity = mentionEntities[0];
      const username = ctx.update.message.text.substr(entity.offset + 1, entity.length - 1);
      const userId = await TgUsernameMapperService.getId(username);
      if (!userId) {
        await ctx.reply("Unable to get recipient id, please try again by replying to recipient's message.");
        return;
      }

      try {
        const member = await ctx.getChatMember(userId);
        to = member.user;
      } catch (e) {
        log.error(e);
        await ctx.reply("Unable to get recipient id, please try again by replying to recipient's message.");
        return;
      }
    } else {
      await ctx.reply("Unable to get recipient id, please try again by replying to recipient's message.");
      return;
    }

    if (to.is_bot) {
      return;
    }

    if (from.id === to.id) {
      await ctx.reply("Try tipping other people instead.")
      return;
    }

    const toId = `${to.id}`;
    const amount = BigInt(convert(amountString, { from: Unit.nano, to: Unit.raw }));

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
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "What's this?",
                  url: `https://t.me/${ctx.me.username}?start`,
                },
              ],
            ],
          },
        }
      );
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

async function getBalance(ctx: NyanoTipBotContext): Promise<void> {
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

async function withdrawBalance(ctx: NyanoTipBotContext): Promise<void> {
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

function sendMessageOnTopUp(bot: Bot<NyanoTipBotContext>) {
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
  usernameRecorderMiddleware,
  start,
  handleMessage,
  getBalance,
  withdrawBalance,
  sendMessageOnTopUp,
};
