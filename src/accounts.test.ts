import { Account, getAccountByAddress, getAccountByTgUserId } from "./accounts";
import { db } from "./db";

describe("Accounts", () => {
  const existingAccount: Account = {
    tgUserId: "test-tgUserId",
    seedIndex: 0,
    address: "some address",
    withdrawalAddress: null
  };

  beforeEach(async () => {
    await db.put(`tg-${existingAccount.tgUserId}`, existingAccount);
    await db.put(`address-${existingAccount.address}`, existingAccount);
  });

  afterEach(async () => {
    await db.del(`tg-${existingAccount.tgUserId}`);
    await db.del(`address-${existingAccount.address}`);
  });

  describe("get account by tg userId", () => {
    it("should return null when no account found", async () => {
      const account = await getAccountByTgUserId("does-not-exists");

      expect(account).toBeNull();
    });

    it("should return account when account exists", async () => {
      const account = await getAccountByTgUserId(existingAccount.tgUserId);

      expect(account).toEqual(existingAccount);
    });
  });

  describe("get account by address", () => {
    it("should return null when no account found", async () => {
      const account = await getAccountByAddress("does-not-exists");

      expect(account).toBeNull();
    });

    it("should return account when account exists", async () => {
      const account = await getAccountByAddress(existingAccount.address);

      expect(account).toEqual(existingAccount);
    });
  });
});
