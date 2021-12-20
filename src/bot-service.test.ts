import { Chat, Message, Update, User } from "@grammyjs/types";
import { when } from "jest-when";
import { BotService } from "./bot-service";
import { NyanoTipBotContext } from "./context";
import { BusinessErrors } from "./errors";
import { TgUsernameMapperService } from "./tg-username-mapper-service";
import { TipService } from "./tip-service";

jest.mock("./tip-service");
jest.mock("./tg-username-mapper-service");
jest.mock("@grammyjs/menu", () => {
  const menu: any = {
    row: jest.fn(() => menu),
    register: jest.fn(() => menu),
    submenu: jest.fn(() => menu),
    url: jest.fn(() => menu),
    text: jest.fn(() => menu),
    back: jest.fn(() => menu),
    dynamic: jest.fn(() => menu),
  };

  return {
    Menu: jest.fn(() => menu),
  }
});

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
      await BotService.handleStartCommand(ctx);

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
        .mockResolvedValue({ balance: 10000000000000000000000000n, pending: 0n });
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
      await BotService.handleStartCommand(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        "Balance: 10 nyano (0.00001 NANO)\nPending: 0 nyano (0 NANO)\n\nIt may take a few moments for your balance to be updated after you have done your top-up.\n\nAddress: nanoAddress",
        {
          reply_markup: expect.anything(),
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
        .mockResolvedValue({ balance: 10000000000000000000000000n, pending: 0n });
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
      await BotService.handleStartCommand(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringMatching(/.+/), {
        parse_mode: "MarkdownV2",
        reply_markup: expect.anything(),
      });
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

    it("should not tip user when no message reply or mention found", async () => {
      const user1 = createTgUser();
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "!tip 10",
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Reply to a message or mention a user to tip. Multiple mentions are not supported.");
    });

    it("should not tip users when multiple users are mentioned", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser({ username: "user2" });
      const user3 = createTgUser({ username: "user3" });
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: `@${user2.username} @${user3.username} !tip 10`,
            entities: [
              {
                type: 'text_mention',
                offset: 0,
                length: 6,
                user: user2,
              },
              {
                type: 'text_mention',
                offset: 7,
                length: 6,
                user: user3,
              },
            ],
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Reply to a message or mention a user to tip. Multiple mentions are not supported.");
    });

    it("should not tip user when unable to retrieve user details from username", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser({ username: "user2" });
      when(TgUsernameMapperService.getId)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .calledWith(user2.username!)
        .mockResolvedValue(null);
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: `@${user2.username} !tip 10`,
            entities: [
              {
                type: 'mention',
                offset: 0,
                length: 6,
              },
            ],
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Unable to get recipient id, please try again by replying to recipient's message.");
    });

    it("should not tip if sender is a bot", async () => {
      const user1 = createTgUser();
      const botUser = createTgUser({ is_bot: true });
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: botUser,
            text: "!tip 10",
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
            text: "!tip 10",
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
            text: "!tip 10",
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

    it("should tip recipient 100 nyano when '!tip 100' is sent as a reply to a message", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "!tip 100",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 100000000000000000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);
      await new Promise(r => setTimeout(r, 0));

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `**[100](http://block-url.com)** nyano sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "What's this?",
                  url: `https://t.me/bot_username?start`,
                },
              ],
            ],
          },
        }
      );
    });

    it("should tip recipient 10 nyano when '/tip' is sent as a reply to a message", async () => {
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
        .mockResolvedValue({ balance: 10000000000000000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 10000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);
      await new Promise(r => setTimeout(r, 0));

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `**[10](http://block-url.com)** nyano sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "What's this?",
                  url: `https://t.me/bot_username?start`,
                },
              ],
            ],
          },
        }
      );
    });

    it("should tip recipient 10.5 nyano when 'thanks! !tip 10.5' is sent as a reply to a message", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "thanks! !tip 10.5",
        reply_to_message: {
          ...createTgMessage(),
          from: user2,
          reply_to_message: undefined,
        },
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 10500000000000000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 10500000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);
      await new Promise(r => setTimeout(r, 0));

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `**[10\\.5](http://block-url.com)** nyano sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "What's this?",
                  url: `https://t.me/bot_username?start`,
                },
              ],
            ],
          },
        }
      );
    });

    it("should tip recipient 10 nyano when 'thanks for the help!! !tip' is sent as a reply to a message", async () => {
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
        .mockResolvedValue({ balance: 10000000000000000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 10000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);
      await new Promise(r => setTimeout(r, 0));

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `**[10](http://block-url.com)** nyano sent to [${message.reply_to_message?.from?.first_name}](tg://user?id=${message.reply_to_message?.from?.id})\\!`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "What's this?",
                  url: `https://t.me/bot_username?start`,
                },
              ],
            ],
          },
        }
      );
    });

    it("should tip recipient 100 nyano when '!tip 100' is sent with a mention to single user (text_mention)", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser({
        username: "omar_new",
      });
      const message = createTgMessage({
        from: user1,
        text: `@${user2.username} !tip 100`,
        entities: [
          {
            type: 'text_mention',
            offset: 0,
            length: 6,
            user: user2,
          },
        ],
      });
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 100000000000000000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);
      await new Promise(r => setTimeout(r, 0));

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `**[100](http://block-url.com)** nyano sent to [${user2.first_name}](tg://user?id=${user2.id})\\!`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "What's this?",
                  url: `https://t.me/bot_username?start`,
                },
              ],
            ],
          },
        }
      );
    });

    it("should tip recipient 100 nyano when '!tip 100' is sent with a mention to single user (mention)", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser({
        username: "omar_new",
      });
      const message = createTgMessage({
        from: user1,
        text: `@${user2.username} !tip 100`,
        entities: [
          {
            type: 'mention',
            offset: 0,
            length: 9,
          },
        ],
      });
      when(TgUsernameMapperService.getId)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .calledWith(user2.username!)
        .mockResolvedValue(user2.id);
      when(TipService.getBalance)
        .calledWith(`${user2.id}`)
        .mockResolvedValue({ balance: 100000000000000000000000000n, pending: 0n });
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      when(ctx.getChatMember)
        .calledWith(user2.id)
        .mockResolvedValue({
          user: user2,
          status: "member",
        });
      await BotService.handleMessage(ctx);
      await new Promise(r => setTimeout(r, 0));

      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        `**[100](http://block-url.com)** nyano sent to [${user2.first_name}](tg://user?id=${user2.id})\\!`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "What's this?",
                  url: `https://t.me/bot_username?start`,
                },
              ],
            ],
          },
        }
      );
    });

    it("should reply that the user has insufficient balance and prompt to top up", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      const message = createTgMessage({
        from: user1,
        text: "!tip 10",
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
        .calledWith( `${user1.id}`, `${user2.id}`, 10000000000000000000000000n)
        .mockRejectedValue(BusinessErrors.INSUFFICIENT_BALANCE);
      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);
      await new Promise(r => setTimeout(r, 0));

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
        .mockResolvedValue({ balance: 10000000000000000000000000n, pending: 0n });
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
      await BotService.handleBalanceCommand(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        "Balance: 10 nyano (0.00001 NANO)\nPending: 0 nyano (0 NANO)\n\nIt may take a few moments for your balance to be updated after you have done your top-up.\n\nAddress: nanoAddress",
        {
          reply_markup: expect.anything(),
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
      await BotService.handleBalanceCommand(ctx);

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
      await BotService.handleBalanceCommand(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("DM me (@bot_username) privately to check your balance.");
    });
  });
});

function createContext(update: Update): NyanoTipBotContext {
  return {
    update,
    ...(update.message?.from ? { from: update.message.from } : {}),
    ...(update.message? { message: update.message} : {}),
    match: update.message?.text?.startsWith("/") ? update.message?.text?.split(" ").slice(1).join(" ") : undefined,
    reply: jest.fn(() => createTgMessage()),
    getChatMember: jest.fn(),
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
