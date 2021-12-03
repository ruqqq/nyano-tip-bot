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
    address: "nanoAddress1",
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
    address: "nanoAddress2",
    seedIndex: 2,
    withdrawalAddress: null,
  };
  const account2KeyMetadata = {
    secretKey: "secretKey2",
    publicKey: "publicKey2",
    address: account2.address,
  };

  afterEach(resetAllWhenMocks);

  describe("get user account", () => {
    it("should return account", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);

      const account = await TipService.getAccount(account1.tgUserId);

      expect(account).toEqual(account1);
    });
  });

  describe("get user account balance", () => {
    it("should return account current balance", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), account1.seedIndex)
        .mockReturnValue(account1KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account1KeyMetadata.secretKey)
        .mockReturnValue(account1KeyMetadata);
      when(Nano.getBalance)
        .calledWith(account1.address)
        .mockResolvedValue({ balance: 100n, pending: 0n });

      const balance = await TipService.getBalance(account1.tgUserId);

      expect(Nano.processPendingBlocks).toHaveBeenCalledWith(account1KeyMetadata.secretKey);
      expect(balance).toEqual({ balance: 100n, pending: 0n });
    });
  });

  describe("get nano wallet url to topup balance", () => {
    it("should return a url", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);

      const url = await TipService.getLinkForTopUp(account1.tgUserId);

      expect(url).toEqual("https://paynano.me/nanoAddress1");
    });
  });

  describe("get explorer url to account", () => {
    it("should return a url", async () => {
      when(Accounts.getAccountByTgUserId)
        .calledWith(account1.tgUserId)
        .mockResolvedValue(account1);
      when(Nano.getAccountExplorerUrl)
        .calledWith(account1.address)
        .mockReturnValue("http://google.com")

      const url = await TipService.getLinkForAccount(account1.tgUserId);

      expect(url).toEqual("http://google.com");
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
        .mockResolvedValue({ balance: 0n, pending: 0n });

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
        .mockResolvedValue({ balance: 1n, pending: 0n });
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), account1.seedIndex)
        .mockReturnValue(account1KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account1KeyMetadata.secretKey)
        .mockReturnValue(account1KeyMetadata);
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), account2.seedIndex)
        .mockReturnValue(account2KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account2KeyMetadata.secretKey)
        .mockReturnValue(account2KeyMetadata);
      when(Nano.send)
        .calledWith(
          account1KeyMetadata.secretKey,
          account2.address,
          1n,
        )
        .mockResolvedValue( { block: { hash: "hash" } } as any);
      when(Nano.getBlockExplorerUrl)
        .calledWith(expect.anything())
        .mockImplementation((hash) => `http://${hash}`);

      const url = await TipService.tipUser(
        account1.tgUserId,
        account2.tgUserId,
        1n,
      );

      expect(url).toEqual("http://hash");
      expect(Nano.processPendingBlocks).toHaveBeenCalledWith(account2KeyMetadata.secretKey);
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
        .mockResolvedValue({ balance: 0n, pending: 0n });

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
        .mockResolvedValue({ balance: 0n, pending: 0n });

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

  describe("listen on confirmed send blocks and generate receive blocks", () => {
    it("should generate receive blocks and emit onTopUp", async () => {
      const cb = jest.fn();
      const block = {
        type: "state",
        account: account2.address,
        previous:
          "7DA32EAEFA29A67F45BBCA61F75A6EF7F78155C49A39DA26AD57CE4AE57A2079",
        representative:
          "nano_1n747n7fgebsk93khx6fkrj9wmjkgho6zsmb1m7men39uz4pafmmimhob7y7",
        balance: "11984000000000000000000000000",
        link: "52F120D524A5B9870C894E1624813C551B89B5D3BBC2092360E615569D2B8E91",
        link_as_account: account1.address,
        signature:
          "707A4F6E54BACD9628948DAE9526591438CF54685642DF0594585865E43887F3D874055991E5E75D8F56B90E1ABD2F890A3FAE2A7B88C7DB3D9A14EFFF62920C",
        work: "08c3cf84614bc310",
        subtype: "send",
      };
      when(Accounts.getAccountByAddress)
        .calledWith(block.link_as_account)
        .mockResolvedValue(account1);
      when(Accounts.getAccountByAddress)
        .calledWith(block.account)
        .mockResolvedValue(null);
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), account1.seedIndex)
        .mockReturnValue(account1KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account1KeyMetadata.secretKey)
        .mockReturnValue(account1KeyMetadata);
      when(Nano.processPendingBlocks)
        .calledWith(account1KeyMetadata.secretKey)
        .mockResolvedValue([]);
      TipService.subscribeToOnReceiveBalance({ onTip: cb, onTopUp: cb });

      await(Nano.subscribeToConfirmations as jest.Mock).mock.calls[0][0](
        "127067B2C455402CE36A21A5BEF5F368791D0981E12C571CB1086BC0FF5E4BD2",
        block
      );

      expect(cb).toHaveBeenCalledWith(account1.tgUserId);
      expect(cb).not.toHaveBeenCalledWith(account2.tgUserId, account1.tgUserId);
    });

    it("should generate receive blocks onTip", async () => {
      const cb = jest.fn();
      const block = {
        type: "state",
        account: account2.address,
        previous:
          "7DA32EAEFA29A67F45BBCA61F75A6EF7F78155C49A39DA26AD57CE4AE57A2079",
        representative:
          "nano_1n747n7fgebsk93khx6fkrj9wmjkgho6zsmb1m7men39uz4pafmmimhob7y7",
        balance: "11984000000000000000000000000",
        link: "52F120D524A5B9870C894E1624813C551B89B5D3BBC2092360E615569D2B8E91",
        link_as_account: account1.address,
        signature:
          "707A4F6E54BACD9628948DAE9526591438CF54685642DF0594585865E43887F3D874055991E5E75D8F56B90E1ABD2F890A3FAE2A7B88C7DB3D9A14EFFF62920C",
        work: "08c3cf84614bc310",
        subtype: "send",
      };
      when(Accounts.getAccountByAddress)
        .calledWith(block.link_as_account)
        .mockResolvedValue(account1);
      when(Accounts.getAccountByAddress)
        .calledWith(block.account)
        .mockResolvedValue(account2);
      when(Nano.getSecretKeyFromSeed)
        .calledWith(expect.anything(), account1.seedIndex)
        .mockReturnValue(account1KeyMetadata.secretKey);
      when(Nano.extractAccountMetadata)
        .calledWith(account1KeyMetadata.secretKey)
        .mockReturnValue(account1KeyMetadata);
      when(Nano.processPendingBlocks)
        .calledWith(account1KeyMetadata.secretKey)
        .mockResolvedValue([]);
      TipService.subscribeToOnReceiveBalance({ onTip: cb, onTopUp: cb });

      await(Nano.subscribeToConfirmations as jest.Mock).mock.calls[0][0](
        "127067B2C455402CE36A21A5BEF5F368791D0981E12C571CB1086BC0FF5E4BD2",
        block
      );

      expect(cb).toHaveBeenCalledWith(account2.tgUserId, account1.tgUserId);
      expect(cb).not.toHaveBeenCalledWith(account1.tgUserId);
    });

    it("should do nothing when receiving address is not in account records", async () => {
      const cb = jest.fn();
      const block = {
        type: "state",
        account:
          "nano_34dx4n37jkbxpihuhgytqq64a1i164t8okyzf1ez9afton185njksbqctidb",
        previous:
          "7DA32EAEFA29A67F45BBCA61F75A6EF7F78155C49A39DA26AD57CE4AE57A2079",
        representative:
          "nano_1n747n7fgebsk93khx6fkrj9wmjkgho6zsmb1m7men39uz4pafmmimhob7y7",
        balance: "11984000000000000000000000000",
        link: "52F120D524A5B9870C894E1624813C551B89B5D3BBC2092360E615569D2B8E91",
        link_as_account:
          "nano_1nqj65ckbbfsiw8akmip6k1mroauj8tx9gy436jp3sioctgkq5njtm4m3g1x",
        signature:
          "707A4F6E54BACD9628948DAE9526591438CF54685642DF0594585865E43887F3D874055991E5E75D8F56B90E1ABD2F890A3FAE2A7B88C7DB3D9A14EFFF62920C",
        work: "08c3cf84614bc310",
        subtype: "send",
      };
      when(Accounts.getAccountByAddress)
        .calledWith(block.link_as_account)
        .mockResolvedValue(null);
      TipService.subscribeToOnReceiveBalance({ onTip: cb, onTopUp: cb });

      await(Nano.subscribeToConfirmations as jest.Mock).mock.calls[0][0](
        "127067B2C455402CE36A21A5BEF5F368791D0981E12C571CB1086BC0FF5E4BD2",
        block
      );

      expect(cb).not.toHaveBeenCalled();
    });
  })
});

