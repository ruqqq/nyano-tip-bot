import level from "level";

export const db = level(
  process.env.DB_FILE ?? "./db",
  { valueEncoding: "json" },
);

export const workCacheDb = level(
  process.env.WORK_CACHE_DB_FILE ?? "./work-cache-db",
  { valueEncoding: "json" },
);

export const tgUsernameDb = level(
  process.env.WORK_CACHE_DB_FILE ?? "./tg-username-db",
  { valueEncoding: "json" },
);
