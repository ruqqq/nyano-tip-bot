import { tgUsernameDb } from "./db";
import { NotFoundError } from "level-errors";

async function put(
  username: string,
  id: number,
): Promise<void> {
  const existingUsername = await getUsername(id);
  if (!existingUsername || existingUsername !== username) {
    if (existingUsername) {
      await tgUsernameDb.del(`user-${existingUsername}`);
    }
    await tgUsernameDb.put(`user-${username}`, `${id}`);
    await tgUsernameDb.put(`id-${id}`, username);
  }
}

async function getId(
  username: string
): Promise<number | null> {
  try {
    const value = await tgUsernameDb.get(`user-${username}`);
    return parseInt(value);
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

async function getUsername(
  id: number,
): Promise<string | null> {
  try {
    return await tgUsernameDb.get(`id-${id}`);
  } catch (e) {
    if (!(e instanceof NotFoundError)) {
      throw e;
    }

    return null;
  }
}

export const TgUsernameMapperService = {
  put,
  getId,
  getUsername,
};
