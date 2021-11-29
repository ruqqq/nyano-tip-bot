import { MnanoContext } from "./context";

async function handleMessage(ctx: MnanoContext): Promise<void> {
  ctx.reply("Got a message: " + ctx.update.message);
}

export const BotService = {
  handleMessage,
};
