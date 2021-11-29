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
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "!tip 0.0001",
            reply_to_message: {
              ...createTgMessage(),
              from: user2,
              reply_to_message: undefined,
            },
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Tipped!");
      expect(TipService.tipUser).toHaveBeenCalledWith(
        `${user1.id}`,
        `${user2.id}`,
        100000000000000000000000000n
      );
    });

    it("should reply that the user has insufficient balance and prompt to top up", async () => {
      const user1 = createTgUser();
      const user2 = createTgUser();
      when(TipService.tipUser)
        .calledWith( `${user1.id}`, `${user2.id}`, 100000000000000000000000000n)
        .mockRejectedValue(BusinessErrors.INSUFFICIENT_BALANCE);
      const ctx = createContext(
        createTgUpdate({
          message: createTgMessage({
            from: user1,
            text: "!tip 0.0001",
            reply_to_message: {
              ...createTgMessage(),
              from: user2,
              reply_to_message: undefined,
            },
          }),
        })
      );
      await BotService.handleMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("Insufficient balance. Please top-up and try again.");
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
  return {
    id: new Date().getTime(),
    is_bot: false,
    first_name: "",
    ...overrides,
  };
}
