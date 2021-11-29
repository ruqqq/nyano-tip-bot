import { Chat, Message, Update, User } from "@grammyjs/types";
import { when } from "jest-when";
import { BotService } from "./bot-service";
import { MnanoContext } from "./context";
import { BusinessErrors } from "./errors";
import { TipService } from "./tip-service";

jest.mock("./tip-service");

describe("BotService", () => {
  describe("handleMessage", () => {
    it("should not reply to the message when no !tip keyword found", async () => {
      const ctx = createContext(createTgUpdate());

      await BotService.handleMessage(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    describe("should not tip when !tip keyword is found but invalid format", () => {
      it.each(["!tip", "!tip abcde", "hey !tip abcde", "hey !tip"])(
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
      when(TipService.tipUser)
        .calledWith(`${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockResolvedValue("http://block-url.com");

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        "[0.0001](http://block-url.com) NANO sent!",
        { parse_mode: "MarkdownV2", reply_to_message_id: message.message_id }
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
        .mockResolvedValue(0n);

      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        `Congratulations [${user2.first_name}](tg://user?id=${user2.id}) on your first tip! Click the button below to learn how to withdraw your tip.`, {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [[{ text: "Withdraw", url: "" }]],
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
      when(TipService.tipUser)
        .calledWith( `${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockRejectedValue(BusinessErrors.INSUFFICIENT_BALANCE);
      const ctx = createContext(
        createTgUpdate({
          message,
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Insufficient balance. Please top-up and try again.", { reply_to_message_id: message.message_id });
    });
  });
});

function createContext(update: Update): MnanoContext {
  return {
    update,
    reply: jest.fn(),
  } as any;
}

function createTgUpdate(overrides?: Partial<Update>): Update {
  return {
    update_id: new Date().getTime(),
    message: createTgMessage(),
    ...overrides,
  };
}

function createTgMessage(overrides?: Partial<Message>): Message {
  return {
    text: "some message",
    message_id: new Date().getTime(),
    date: new Date().getTime(),
    chat: createTgGroupChat(),
    ...overrides,
  };
}

function createTgGroupChat(
  overrides?: Partial<Chat.GroupChat>
): Chat.GroupChat {
  return {
    id: new Date().getTime(),
    type: "group",
    title: "chat title",
    ...overrides,
  };
}

function createTgUser(overrides?: Partial<User>): User {
  const id = new Date().getTime();
  return {
    id,
    is_bot: false,
    first_name: `User ${id}`,
    ...overrides,
  };
}