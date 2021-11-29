import { Account, Accounts } from "./accounts";
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
    await db.del("last-seed-index");
  });

  describe("get account by tg userId", () => {
    it("should return null when no account found", async () => {
      const account = await Accounts.getAccountByTgUserId("does-not-exists");

      expect(account).toBeNull();
    });

    it("should return account when account exists", async () => {
      const account = await Accounts.getAccountByTgUserId(existingAccount.tgUserId);

      expect(account).toEqual(existingAccount);
    });
  });

  describe("get account by address", () => {
    it("should return null when no account found", async () => {
      const account = await Accounts.getAccountByAddress("does-not-exists");

      expect(account).toBeNull();
    });

    it("should return account when account exists", async () => {
      const account = await Accounts.getAccountByAddress(existingAccount.address);

      expect(account).toEqual(existingAccount);
    });
  });

  describe("save account", () => {
    const newAccount: Account = {
      tgUserId: "test-tgUserId-new",
      seedIndex: 0,
      address: "some address-new",
      withdrawalAddress: null
    };

    afterEach(async () => {
      try {
        await db.del(`tg-${newAccount.tgUserId}`);
        await db.del(`address-${newAccount.address}`);
      // eslint-disable-next-line no-empty
      } catch (e) {}
    });

    it("should save account and reference-able from both tgUserId and address", async () => {
      await Accounts.saveAccount(newAccount);

      expect(await db.get(`tg-${newAccount.tgUserId}`)).not.toBeNull();
      expect(await db.get(`address-${newAccount.address}`)).not.toBeNull();
    });
  });

  describe("getAndIncrementLastSeedIndex", () => {
    it("should atomically increment last-seed-index", async () => {
      await Promise.all([
        Accounts.getAndIncrementLastSeedIndex(),
        Accounts.getAndIncrementLastSeedIndex(),
        Accounts.getAndIncrementLastSeedIndex(),
      ]);

      const seedIndex = await Accounts.getAndIncrementLastSeedIndex();

      expect(seedIndex).toEqual(1004);
    })
  });
});
