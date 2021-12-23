import { Bot, BotError, GrammyError, HttpError, NextFunction } from "grammy";
import { convert, Unit, checkAddress } from "nanocurrency";
import { NyanoTipBotContext } from "./context";
import { BusinessErrors } from "./errors";
import { TipService } from "./tip-service";
import log from "loglevel";
import { User } from "@grammyjs/types";
import { TgUsernameMapperService } from "./tg-username-mapper-service";
import { Menu } from "@grammyjs/menu";
import { PendingTxService } from "./pending-tx-service";

async function usernameRecorderMiddleware(ctx: NyanoTipBotContext, next: NextFunction) {
  const from = ctx.update.message?.from;
  if (from?.username) {
    await TgUsernameMapperService.put(from.username, from.id);
  }
  await next();
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
    const replyToMessageId = ctx.update.message.message_id;

    new Promise((resolve, reject) => {
      (async () => {
        try {
          const msg = await ctx.reply(`Sending **${amountString.replace(/\./, "\\.")}** nyano to [${to.first_name}](tg://user?id=${to.id})\\.\\.\\.`, {
            parse_mode: "MarkdownV2",
            reply_to_message_id: replyToMessageId,
          });
          const id = await TipService.tipUser(fromId, toId, amount);
          await PendingTxService.put(id, {
            sendingTgUserId: fromId,
            receivingTgUserId: toId,
            amount: amountString,
            id,
            chatId: msg.chat.id,
            messageId: msg.message_id,
            text: `**[${amountString.replace(
              /\./,
              "\\."
            )}](${TipService.getLinkForBlock(id)})** nyano sent to [${to.first_name}](tg://user?id=${
              to.id
            })\\!`,
            textParams: {
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
            },
            action: "tip",
          });
          resolve(undefined);
        } catch (e) {
          if (e === BusinessErrors.INSUFFICIENT_BALANCE) {
            await ctx.reply("Insufficient balance\\. Please top\\-up and try again\\.", {
              parse_mode: "MarkdownV2",
              reply_to_message_id: replyToMessageId,
              reply_markup: {
                inline_keyboard: [[{ text: "Top-up", url: `https://t.me/${ctx.me.username}?start=topup` }]],
              },
            });
          } else {
            reject(e);
          }
        }
      })();
    })
    .catch(err => {
      const wrappedError = new BotError<NyanoTipBotContext>(err, ctx);
      handleError(wrappedError);
    });
  }
}

async function getBlockExplorerUrl(ctx: NyanoTipBotContext): Promise<string> {
  if (!ctx.from) {
    throw new Error("From not found in context");
  }
  if (ctx.from.is_bot) {
    throw new Error("Trying to generate block explorer url for a bot");
  }
  const from = ctx.from;
  const fromId = `${from.id}`;
  return await TipService.getLinkForAccount(fromId);
}

async function getTopupUrl(ctx: NyanoTipBotContext): Promise<string> {
  if (!ctx.from) {
    throw new Error("From not found in context");
  }
  if (ctx.from.is_bot) {
    throw new Error("Trying to generate topup url for a bot");
  }
  const from = ctx.from;
  const fromId = `${from.id}`;
  return await TipService.getLinkForTopUp(fromId);
}

async function generateBalanceMessage(ctx: NyanoTipBotContext): Promise<string> {
  if (!ctx.from) {
    throw new Error("From not found in context");
  }
  if (ctx.from.is_bot) {
    throw new Error("Trying to generate topup url for a bot");
  }

  const from = ctx.from;
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

  return `Balance: ${balanceFormatted} nyano (${balanceFormattedNano} NANO)\nPending: ${pendingFormatted} nyano (${pendingFormattedNano} NANO)\n\nIt may take a few moments for your balance to be updated after you have done your top-up.\n\nAddress: ${account.address}`;
}

async function getNanoAddress(ctx: NyanoTipBotContext): Promise<string> {
  if (!ctx.from) {
    throw new Error("From not found in context");
  }
  if (ctx.from.is_bot) {
    throw new Error("Trying to generate topup url for a bot");
  }

  const from = ctx.from;
  const fromId = `${from.id}`;
  const account = await TipService.getAccount(fromId);

  return account.address;
}

async function handleBalanceCommand(ctx: NyanoTipBotContext): Promise<void> {
  if (!ctx.from) {
    return;
  }

  if (ctx.from.is_bot) {
    return;
  }

  if (ctx.message && ctx.message.chat.type !== "private") {
    await ctx.reply(`DM me (@${ctx.me.username}) privately to check your balance.`)
    return;
  }

  log.info(`${ctx.from.id} requested /balance`);

  const text = await generateBalanceMessage(ctx);

  await ctx.reply(text, {
    reply_markup: accountBalanceMenu,
  })
}

const INVALID_WITHDRAW_COMMAND = "Please provide a valid amount and address to withdraw to. Example: /withdraw 100 nano_3gisuhb6fhda965d6p8wu4mfenrducg4thhmh7bd9gxwt8a1oijiuy4pscip";

async function handleWithdrawBalance(ctx: NyanoTipBotContext): Promise<void> {
  if (!ctx.from) {
    return;
  }
  if (ctx.from.is_bot) {
    return;
  }

  if (ctx.message && ctx.message.chat.type !== "private") {
    await ctx.reply(`DM me (@${ctx.me.username}) privately to withdraw your balance.`)
    return;
  }

  if (!ctx.match) {
    await ctx.reply(INVALID_WITHDRAW_COMMAND)
    return;
  }

  const inputs = (ctx.match as string).match(/(^[0-9]+(\.[0-9]+)?){1}\s(.+)/);
  if (!inputs || inputs.length < 4) {
    await ctx.reply(INVALID_WITHDRAW_COMMAND)
    return;
  }

  const amountString = inputs[1];
  const toAddress = inputs[3];

  if (!checkAddress(toAddress)) {
    await ctx.reply(INVALID_WITHDRAW_COMMAND)
    return;
  }

  ctx.session.withdrawalSession = {
    fromUserId: `${ctx.from.id}`,
    toAddress: toAddress,
    amount: amountString,
  }

  await ctx.reply(
    `Please confirm that the address and amount below is correct\\.
Sending your nano to the wrong address will not be reversible\\!

Withdraw to\\: **${toAddress.replace(/_/g, "\\_")}**
Amount\\: **${amountString.replace(/\./g, "\\.")} nyano**`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: withdrawMenu,
    }
  );
}

async function handleStartCommand(ctx: NyanoTipBotContext) {
  if (!ctx.from) {
    return;
  }
  if (ctx.from.is_bot) {
    return;
  }

  if (ctx.message && ctx.message.chat.type !== "private") {
    return;
  }

  log.info(`${ctx.from.id} requested ${ctx.message?.text}`);

  if (!ctx.match) {
    await ctx.reply(startText, { parse_mode: "MarkdownV2", reply_markup: startMenu });
  } else if (ctx.match === "topup") {
    await ctx.reply(await generateBalanceMessage(ctx), { reply_markup: accountBalanceMenu });
  }
}

async function handleError(err: BotError<NyanoTipBotContext>) {
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
}

function sendMessageOnTopUp(bot: Bot<NyanoTipBotContext>) {
  TipService.subscribeToConfirmedTx({
    onTip: async (id, fromTgUserId, toTgUserId, status) => {
      if (status === "pending") {
        return;
      }

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
      try {
        const pendingTx = await PendingTxService.get(id);
        if (pendingTx) {
          await bot.api.editMessageText(
            pendingTx.chatId,
            pendingTx.messageId,
            pendingTx.text,
            pendingTx.textParams,
          );
          await PendingTxService.del(id);
        }
      } catch (e) {
        log.warn(e);
      }
    },
    onTopUp: async (id, tgUserId, status) => {
      if (status === "pending") {
        return;
      }

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
    },
    onWithdraw: async (id, tgUserId) => {
      try {
        const pendingTx = await PendingTxService.get(id);
        if (pendingTx) {
          await bot.api.editMessageText(
            pendingTx.chatId,
            pendingTx.messageId,
            pendingTx.text,
            pendingTx.textParams,
          );
          await PendingTxService.del(id);
        }
      } catch (e) {
        log.warn(e);
      }
    },
  });
}

const startText = `[Nano](https://nano.org/) is a cryptocurrency that allows for instant and feeless payment\\. This makes it the perfect currency to tip others\\.

Ways to tip users\\:
1\\. Reply to their messages with \\"\\/tip \\<value\\>\\"
2\\. Tag the user and type \\"\\/tip \\<value\\>\\" in your message
3\\. Reply or tag user and include \\"\\!tip \\<value\\>\\" anywhere in your message

Note\\:
\\- The value is in [Nyano](https://www.reddit.com/r/nyano/) \\(1 nyano \\= 0\\.000001 nano\\)
\\- If you do not specify the value\\, it will default to tip 10 Nyano

Have fun tipping\\!`;

const infoLedgerText = `Despite NyanoTipBot holding your balance\\, because Nano is a cryptocurrency\\, the ledger is transparent\\.
You can view your NyanoTipBot wallet on a block explorer website\\.

Likewise\\, for every tip that happens\\, it is an actual Nano transaction on\\-chain and you can view the transaction in the block explorer too\\.
`;

const startMenu: Menu<NyanoTipBotContext> = new Menu<NyanoTipBotContext>("start-menu")
  .submenu("Withdraw to personal wallet",  "info-withdraw-menu", (ctx) =>
    ctx.editMessageText("You can withdraw to your own wallet by using the command /withdraw <value> <nano address>\n\nYou can use the withdrawn NANO to buy other cryptos or convert to fiat on exchanges (e.g. crypto.com).")
  )
  .row()
  .submenu("Track your tips journey",  "info-ledger-menu", (ctx) =>
    ctx.editMessageText(infoLedgerText, { parse_mode: "MarkdownV2" })
  )
  .row()
  .submenu("View account balance", "account-balance-menu", async (ctx) =>
    ctx.editMessageText(await generateBalanceMessage(ctx))
  )
  .row()
  .url("1 NANO = x SGD?", "https://www.coingecko.com/en/coins/nano/sgd");

const infoWithdrawMenu: Menu<NyanoTipBotContext> = new Menu<NyanoTipBotContext>("info-withdraw-menu")
  .url("Natrium wallet app","https://natrium.io")
  .row()
  .url("How to setup wallet", "https://www.youtube.com/watch?v=D0dpUB0O6pk")
  .row()
  .url("Crypto.com Exchange", "https://crypto.com/app/vacq39tsgq")
  .row()
  .back("Back", (ctx) => ctx.editMessageText(startText, { parse_mode: "MarkdownV2" }));

const infoLedgerMenu: Menu<NyanoTipBotContext> = new Menu<NyanoTipBotContext>("info-ledger-menu")
  .dynamic(async (ctx, range) => {
    return range
      .url("My Account on Block Explorer", await getBlockExplorerUrl(ctx)).row()
      .back("Back", (ctx) => ctx.editMessageText(startText, { parse_mode: "MarkdownV2" }));
  });

const infoFaucetMenu: Menu<NyanoTipBotContext> = new Menu<NyanoTipBotContext>("info-faucet-menu")
  .url("Free Nyano Faucet", "https://freenyanofaucet.com")
  .row()
  .url("Nano Faucet", "https://nano-faucet.org")
  .row()
  .url("Free Nano Faucet", "https://freenanofaucet.com")
  .row()
  .url("Nano Drop", "https://nanodrop.io")
  .row()
  .url("Nanocafe Faucet", "https://nanocafe.cc/faucet")
  .row()
  .url("Prussia Faucet", "https://faucet.prussia.dev/nano")
  .row()
  .url("WeNano", "https://wenano.net")
  .row()
  .back("Back", (ctx) => ctx.editMessageText(startText, { parse_mode: "MarkdownV2" }));

const accountBalanceMenu: Menu<NyanoTipBotContext> = new Menu<NyanoTipBotContext>("account-balance-menu")
  .dynamic(async (ctx, range) => {
    return range
      .submenu("Get free NANO / nyano", "info-faucet-menu", async (ctx) => {
        const address = await getNanoAddress(ctx);
        await ctx.editMessageText(`You can get free NANOs or nyanos through a faucet. Just paste this address into the faucet pages:\n\n${address}`);
      })
      .row()
      .url("Top-up my tipping wallet", await getTopupUrl(ctx))
      .row()
      .url("My Account on Block Explorer", await getBlockExplorerUrl(ctx))
      .row()
      .back("Back", (ctx) =>
        ctx.editMessageText(startText, { parse_mode: "MarkdownV2" })
      );
  });

startMenu.register(infoWithdrawMenu);
startMenu.register(infoLedgerMenu);
accountBalanceMenu.register(infoFaucetMenu);
startMenu.register(accountBalanceMenu);

const withdrawMenu: Menu<NyanoTipBotContext> = new Menu<NyanoTipBotContext>("withdraw-menu")
  .text({ text: "Confirm" }, async (ctx) => {
    if (!ctx.session.withdrawalSession) {
      await ctx.reply("Unable to process request. Please try again later.",{
        reply_to_message_id: ctx.message?.message_id,
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await ctx.editMessageText(ctx.message!.text!);
      return;
    }

    const {
      fromUserId,
      toAddress,
      amount: amountString,
    } = ctx.session.withdrawalSession;

    const amount = BigInt(convert(amountString, { from: Unit.nano, to: Unit.raw }));

    new Promise((resolve, reject) => {
      (async () => {
        try {
          await ctx.editMessageText(`Performing withdrawal to ${toAddress}...`);
          const id = await TipService.withdrawToAddress(fromUserId, toAddress, amount);
          ctx.session.withdrawalSession = undefined;
          await PendingTxService.put(id, {
            sendingTgUserId: fromUserId,
            amount: amountString,
            id,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            chatId: ctx.chat!.id,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            messageId: ctx.msg!.message_id,
            action: "withdraw",
            text: `Withdrawn **[${amountString.replace(/\./, "\\.")}](${TipService.getLinkForBlock(id)})** nyano to ${toAddress.replace(/_/g, "\\_")}\\!`,
            textParams: {
              parse_mode: "MarkdownV2",
            },
          });
          resolve(undefined);
        } catch (e) {
          reject(e);
        }
      })();
    })
    .catch(err => {
      const wrappedError = new BotError<NyanoTipBotContext>(err, ctx);
      handleError(wrappedError);
    });
  })
  .text("Cancel", async (ctx) => {
    if (!ctx.session.withdrawalSession) {
      await ctx.reply("Unable to process request. Please try again later.",{
        reply_to_message_id: ctx.message?.message_id,
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await ctx.editMessageText(ctx.message!.text!);
      return;
    }

    const {
      toAddress,
      amount: amountString,
    } = ctx.session.withdrawalSession;

    await ctx.editMessageText(`Cancelled withdrawal of ${amountString} nyano to **${toAddress}**.`);
    ctx.session.withdrawalSession = undefined;
  });

export const BotService = {
  usernameRecorderMiddleware,
  handleMessage,
  handleBalanceCommand,
  handleStartCommand,
  handleWithdrawBalance,
  handleError,
  sendMessageOnTopUp,
  startMenu,
  withdrawMenu,
};
