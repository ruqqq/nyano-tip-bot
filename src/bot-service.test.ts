import { Chat, Message, Update, User } from "@grammyjs/types";
import { when } from "jest-when";
import { BotService } from "./bot-service";
import { MnanoContext } from "./context";
import { BusinessErrors } from "./errors";
import { TipService } from "./tip-service";

jest.mock("./tip-service");

describe("BotService", () => {
  describe("start", () => {
    it("should not respond when in group", async () => {
      const user1 = createTgUser();
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "/start topup",
            chat: createTgGroupChat(),
          }),
        })
      );
      await BotService.start(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("get balance when payload is topup", async () => {
      const user1 = createTgUser();
      when(TipService.getAccount)
        .calledWith(`${user1.id}`)
        .mockResolvedValue({
          seedIndex: 1001,
          address: "nanoAddress",
          tgUserId: `${user1.id}`,
          withdrawalAddress: null,
        });
      when(TipService.getBalance)
        .calledWith(`${user1.id}`)
        .mockResolvedValue({ balance: 100000000000000n, pending: 0n });
      when(TipService.getLinkForTopUp)
        .calledWith(`${user1.id}`)
        .mockResolvedValue("http://google.com");
      when(TipService.getLinkForAccount)
        .calledWith(`${user1.id}`)
        .mockResolvedValue("http://google.com");
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "/start topup",
            chat: createTgPrivateChat(),
          }),
        })
      );
      await BotService.start(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        "Balance: 0.0000000000000001 NANO\nPending: 0 NANO\n\nAddress: nanoAddress",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Top-up", url: "http://google.com" }],
              [{ text: "Account Explorer", url: "http://google.com" }],
            ],
          },
        }
      );
    });

    it("show intro message when no payload", async () => {
      const user1 = createTgUser();
      when(TipService.getAccount)
        .calledWith(`${user1.id}`)
        .mockResolvedValue({
          seedIndex: 1001,
          address: "nanoAddress",
          tgUserId: `${user1.id}`,
          withdrawalAddress: null,
        });
      when(TipService.getBalance)
        .calledWith(`${user1.id}`)
        .mockResolvedValue({ balance: 100000000000000n, pending: 0n });
      when(TipService.getLinkForTopUp)
        .calledWith(`${user1.id}`)
        .mockResolvedValue("http://google.com");
      when(TipService.getLinkForAccount)
        .calledWith(`${user1.id}`)
        .mockResolvedValue("http://google.com");
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "/start",
            chat: createTgPrivateChat(),
          }),
        })
      );
      await BotService.start(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(`Nano is a cryptocurrency \\- it can be used for real life transaction\\. You can check the fiat value of Nano [here](https://www.coingecko.com/en/coins/nano/sgd)\\.

Tip telegram users by replying to their message and send \\"\\/tip \\<value\\>\\" where \\<value\\> is the amount you wish to tip\\, e\\.g\\. 0\\.001\\.

MnanoBot holds your balance until you withdraw them to your personal wallet\\. You can get your current balance by using the bot command \\/balance\\.

Despite MnanoBot holding your balance\\, because Nano is a cryptocurrency\\, the ledger is transparent\\. You can view your MnanoBot wallet via the balance command on a block explorer\\. Likewise\\, for every tip that happens\\, it is an actual Nano transaction on\\-chain and you can view the transaction in the block explorer too\\.

Happy tipping\\!`, { parse_mode: "MarkdownV2" });
      expect(ctx.reply).toHaveBeenCalledWith(
        "Balance: 0.0000000000000001 NANO\nPending: 0 NANO\n\nAddress: nanoAddress",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Top-up", url: "http://google.com" }],
              [{ text: "Account Explorer", url: "http://google.com" }],
            ],
          },
        }
      );
    });
  });

  describe("handleMessage", () => {
    it("should not reply to the message when no !tip keyword found", async () => {
      const ctx = createContext(createTgUpdate());

      await BotService.handleMessage(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    describe("should not tip when !tip keyword is found but invalid format", () => {
      it.each(["hey !tipabcde", "hey!tip"])(
        "%s",
        async (text) => {
          const user1 = createTgUser();
          const user2 = createTgUser();
          const ctx = createContext(
            createTgUpdate({
              message: createTgMessage({
                from: user1,
                text,
                reply_to_message: {
                  ...createTgMessage(),
                  from: user2,
                  reply_to_message: undefined,
                },
              }),
            })
          );
          await BotService.handleMessage(ctx);

          expect(ctx.reply).not.toHaveBeenCalled();
        }
      );
    });

    it("should not tip user when no message reply found", async () => {
      const user1 = createTgUser();
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "!tip 0.0001",
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Reply to a message to tip.");
    });

    it("should not tip if sender is a bot", async () => {
      const user1 = createTgUser();
      const botUser = createTgUser({ is_bot: true });
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: botUser,
            text: "!tip 0.0001",
            reply_to_message: {
              ...createTgMessage(),
              from: user1,
              reply_to_message: undefined,
            },
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should not tip if sender is the recipient", async () => {
      const user1 = createTgUser();
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "!tip 0.0001",
            reply_to_message: {
              ...createTgMessage(),
              from: user1,
              reply_to_message: undefined,
            },
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Try tipping other people instead.");
    });

    it("should not tip if recipient is a bot", async () => {
      const user1 = createTgUser();
      const botUser = createTgUser({ is_bot: true });
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "!tip 0.0001",
            reply_to_message: {
              ...createTgMessage(),
              from: botUser,
              reply_to_message: undefined,
            },
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should tip recipient 0.0001 nano when '!tip 0.0001' is sent as a reply to a message", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "!tip 0.0001",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 100000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `[0\\.0001](http://block-url.com) NANO sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        { parse_mode: "MarkdownV2" }
      );
    });

    it("should tip recipient 0.001 nano when '/tip' is sent as a reply to a message", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "/tip",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 100000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 1000000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `[0\\.001](http://block-url.com) NANO sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        { parse_mode: "MarkdownV2" }
      );
    });

    it("should tip recipient 0.0001 nano when 'thanks! !tip 0.0001' is sent as a reply to a message", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "thanks! !tip 0.0001",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 100000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `[0\\.0001](http://block-url.com) NANO sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        { parse_mode: "MarkdownV2" }
      );
    });

    it("should tip recipient 0.001 nano when 'thanks for the help!! !tip' is sent as a reply to a message", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "thanks for the help!! !tip",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 100000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 1000000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `[0\\.001](http://block-url.com) NANO sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        { parse_mode: "MarkdownV2" }
      );
    });

    it("should send additional prompt if it is the first time the recipient receives a tip", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "!tip 0.0001",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 0n, pending: 0n });

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        `Congratulations [${user2.first_name}](tg://user?id=${user2.id}) on your first tip\\! Nano is an actual cryptocurrency. Click the button below to learn more\\.`, {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [[{ text: "Learn More", url: "https://t.me/bot_username?start" }]],
        },
      });
    });

    it("should reply that the user has insufficient balance and prompt to top up", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "!tip 0.0001",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 0n, pending: 0n });
      when(TipService.tipUser)
        .calledWith( `${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockRejectedValue(BusinessErrors.INSUFFICIENT_BALANCE);
      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        "Insufficient balance\\. Please top\\-up and try again\\.",
        {
          parse_mode: "MarkdownV2",
          reply_to_message_id: message.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Top-up",
                  url: `https://t.me/bot_username?start=topup`,
                },
              ],
            ],
          },
        }
      );
    });
  });

  describe("getBalance", () => {
    it("should reply with balance and top-up button and account explorer button", async () => {
      const user1 = createTgUser();
      when(TipService.getAccount)
        .calledWith(`${user1.id}`)
        .mockResolvedValue({
          seedIndex: 1001,
          address: "nanoAddress",
          tgUserId: `${user1.id}`,
          withdrawalAddress: null,
        });
      when(TipService.getBalance)
        .calledWith(`${user1.id}`)
        .mockResolvedValue({ balance: 100000000000000n, pending: 0n });
      when(TipService.getLinkForTopUp)
        .calledWith(`${user1.id}`)
        .mockResolvedValue("http://google.com");
      when(TipService.getLinkForAccount)
        .calledWith(`${user1.id}`)
        .mockResolvedValue("http://google.com");
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "/balance",
            chat: createTgPrivateChat(),
          }),
        })
      );
      await BotService.getBalance(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        "Balance: 0.0000000000000001 NANO\nPending: 0 NANO\n\nAddress: nanoAddress",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Top-up", url: "http://google.com" }],
              [{ text: "Account Explorer", url: "http://google.com" }],
            ],
          },
        }
      );
    });

    it("should not reply when sender is a bot", async () => {
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            text: "/balance",
            from: createTgUser({ is_bot: true }),
            chat: createTgPrivateChat(),
          }),
        })
      );
      await BotService.getBalance(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should not reply when not in private chat", async () => {
      const user1 = createTgUser();
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            text: "/balance",
            from: user1,
            chat: createTgGroupChat(),
          }),
        })
      );
      await BotService.getBalance(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("DM me (@bot_username) privately to check your balance.");
    });
  });
});

function createContext(update: Update): MnanoContext {
  return {
    update,
    reply: jest.fn(() => createTgMessage()),
    api: {
      editMessageText: jest.fn(),
    },
    me: {
      id: -1,
      username: "bot_username",
    },
  } as any;
}

function createTgUpdate(overrides?: Partial<Update>): Update {
  return {
    update_id: new Date().getTime() + Math.floor(Math.random() * 10000),
    message: createTgMessage(),
    ...overrides,
  };
}

function createTgMessage(overrides?: Partial<Message>): Message {
  return {
    text: "some message",
    message_id: new Date().getTime() + Math.floor(Math.random() * 10000),
    date: new Date().getTime(),
    chat: createTgGroupChat(),
    ...overrides,
  };
}

function createTgGroupChat(
  overrides?: Partial<Chat.GroupChat>
): Chat.GroupChat {
  return {
    id: new Date().getTime() + Math.floor(Math.random() * 10000),
    type: "group",
    title: "chat title",
    ...overrides,
  };
}

function createTgPrivateChat(
  overrides?: Partial<Chat.PrivateChat>
): Chat.PrivateChat {
  return {
    id: new Date().getTime() + Math.floor(Math.random() * 10000),
    type: "private",
    first_name: "Some name",
    ...overrides,
  };
}

function createTgUser(overrides?: Partial<User>): User {
  const id = new Date().getTime() + (Math.floor(Math.random() * 10000));
  return {
    id,
    is_bot: false,
    first_name: `User ${id}`,
    ...overrides,
  };
}
