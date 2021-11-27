import { getAccountByTgUserId } from "./accounts";

describe("Accounts", () => {
  describe("get account by tg userId", () => {
    it("should return null when no account found", async () => {
      const account = await getAccountByTgUserId("test-tgUserId");

      expect(account).toBeNull();
    });
  });
});
