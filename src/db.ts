import level from "level";

export const db = level(
  process.env.DB_FILE ?? "./db",
  { valueEncoding: "json" },
);
