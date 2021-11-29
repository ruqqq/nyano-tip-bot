import { resetAllWhenMocks, when } from "jest-when";
import { Account, Accounts } from "./accounts";
import { BusinessErrors } from "./errors";
import { Nano } from "./nano";
import { TipService } from "./tip-service";

jest.mock("./accounts");
jest.mock("./nano");

describe("TipService", () => {
  const account1: Account = {
    tgUserId: "userId1",
    address: "nanoAddress",
    seedIndex: 1,
    withdrawalAddress: null,
  };
  const account1KeyMetadata = {
    secretKey: "secretKey",
    publicKey: "publicKey",
    address: account1.address,
  };
  const account2: Account = {
    tgUserId: "userId2",
    address: "nanoAddress",
    seedIndex: 2,
    withdrawalAddress: null,
  };
  const account2KeyMetadata = {
    secretKey: "secretKey2",
    publicKey: "publicKey2",
    address: account2.address,
  };

  afterEach(resetAllWhenMocks);

  describe("get user account balance", () => {
    it("should return account current balance", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);
      when(Nano.getBalance)
        .calledWith(account1.address)
        .mockResolvedValue(BigInt("100"));

      const balance = await TipService.getBalance(account1.tgUserId);

      expect(balance).toEqual(100n);
    });
  });

  describe("get nano wallet url to topup balance", () => {
    it("should return a url", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);

      const url = await TipService.getLinkForTopUp(account1.tgUserId);

      expect(url).toEqual("nano:nanoAddress?amount=10000000000000000000000000000");
    });
  });

  describe("tip user", () => {
    it("should throw INSUFFICIENT_BALANCE error when tipper has not enough balance", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);
      when(Accounts.getAccountByTgUserId)
        .calledWith(account2.tgUserId)
        .mockResolvedValue(account2);
      when(Nano.getBalance)
        .calledWith(account1.address)
        .mockResolvedValue(0n);

      await expect(TipService.tipUser(
        account1.tgUserId,
        account2.tgUserId,
        1n,
      )).rejects.toThrowError(BusinessErrors.INSUFFICIENT_BALANCE);
    });

    it("should tip when tipper has sufficient balance", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);
      when(Accounts.getAccountByTgUserId)
        .calledWith(account2.tgUserId)
        .mockResolvedValue(account2);
      when(Nano.getBalance)
        .calledWith(account1.address)
        .mockResolvedValue(1n);
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), account1.seedIndex)
        .mockReturnValue(account1KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account1KeyMetadata.secretKey)
        .mockReturnValue(account1KeyMetadata);

      await expect(TipService.tipUser(
        account1.tgUserId,
        account2.tgUserId,
        1n,
      )).resolves.not.toThrow();
      expect(Nano.send).toHaveBeenCalledWith(
        account1KeyMetadata.secretKey,
        account2.address,
        1n,
      );
    });

    it("should automatically create account for tipper when it does not exists", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(null);
      when(Accounts.getAndIncrementLastSeedIndex)
        .calledWith()
        .mockResolvedValue(10);
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), 11)
        .mockReturnValue(account1KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account1KeyMetadata.secretKey)
        .mockReturnValue(account1KeyMetadata);
      when(Accounts.getAccountByTgUserId)
        .calledWith(account2.tgUserId)
        .mockResolvedValue(account2);
      when(Nano.getBalance)
        .calledWith(account1.address)
        .mockResolvedValue(0n);

      await expect(TipService.tipUser(
        account1.tgUserId,
        account2.tgUserId,
        1n,
      )).rejects.toThrowError(BusinessErrors.INSUFFICIENT_BALANCE);
      expect(Accounts.saveAccount).toBeCalledWith({
        ...account1,
        seedIndex: 11,
      });
    });

    it("should automatically create account for tip receiver when it does not exists", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);
      when(Accounts.getAccountByTgUserId)
        .calledWith(account2.tgUserId)
        .mockResolvedValue(null);
      when(Accounts.getAndIncrementLastSeedIndex)
        .calledWith()
        .mockResolvedValue(10);
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), 11)
        .mockReturnValue(account2KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account2KeyMetadata.secretKey)
        .mockReturnValue({
          ...account2KeyMetadata,
        });
      when(Nano.getBalance)
        .calledWith(account1.address)
        .mockResolvedValue(0n);

      await expect(TipService.tipUser(
        account1.tgUserId,
        account2.tgUserId,
        1n,
      )).rejects.toThrowError(BusinessErrors.INSUFFICIENT_BALANCE);
      expect(Accounts.saveAccount).toBeCalledWith({
        ...account2,
        seedIndex: 11,
      });
    });
  });
});

