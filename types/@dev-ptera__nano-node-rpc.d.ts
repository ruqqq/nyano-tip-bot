import * as RPC from "@dev-ptera/nano-node-rpc";

declare module "@dev-ptera/nano-node-rpc" {
  /**
   * @class NanoClient
   * @description An RPC Client for NANO. The official RPC API is here:
   *              https://github.com/clemahieu/raiblocks/wiki/RPC-protocol
   */
  export declare class NanoClient {
      nodeAddress: string;
      // eslint-disable-next-line @typescript-eslint/ban-types
      requestHeaders: Object;
      defaultHeaders: {
          'content-type': string;
      };
      /**
       * @constructor
       * @description Build an instance of `NanoClient`
       * @param {Object} options - The options with either the node URL & custom request headers.
       */
      constructor(options: {
          url?: string;
          // eslint-disable-next-line @typescript-eslint/ban-types
          requestHeaders?: Object;
      });
      /**
       * @function _buildRPCBody
       * @private
       * @description Create an RPC request body to be later used by `#_send`.
       * @param {string} action - A given RPC action.
       * @param {params} params - Optional params for RPC request
       * @return {Object} Returns an object containing the request (url, body).
       */
      private _buildRPCBody;
      /**
       * @function _send
       * @private
       * @description Send the request to the daemon
       * @param {string} method - the name of the RPC method
       * @param {params} params - Optional params for RPC request
       * @returns A Promise which is resolved if the request successfully
       * fetches the data without error, and rejected otherwise.
       * Failure can happen either because of a mis-configured request,
       * server connectivity, or if `JSON.parse` fails
       */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      public _send(method: string, params: any);

      /**
       * Returns how many RAW is owned and how many have not yet been received by account.
       * @param {string} account - The NANO account address.
       */
      account_balance(account: string): Promise<RPC.AccountBalanceResponse>;
      /**
       * Get number of blocks for a specific account
       * @param {string} account - The NANO account address.
       */
      account_block_count(account: string): Promise<RPC.AccountBlockCountResponse>;
      /**
       * Get account number for the public key
       * @param {string} key - A NANO public key.
       */
      account_get(key: string): Promise<RPC.AccountGetResponse>;
      /**
       * Reports send/receive information for a account
       * @param {string} account - The NANO account address.
       * @param {number} count - Response length (default 1)
       * @param {params} params - Optional params for RPC request
       */
      account_history(account: string, count?: number, params?: {
          raw?: boolean;
          head?: string;
          offset?: number;
          reverse?: boolean;
          account_filter?: Array<string>;
      }): Promise<RPC.AccountHistoryResponse>;
      /**
       * Returns frontier, open block, change representative block, balance,
       * last modified timestamp from local database & block count for account
       * @param {string} account - The NANO account address.
       * @param {params} params - Optional params for RPC request
       */
      account_info(account: string, params?: {
          representative?: boolean;
          weight?: boolean;
          pending?: boolean;
      }): Promise<RPC.AccountInfoResponse>;
      /**
       * Get the public key for account
       * @param {string} account - A NANO account.
       */
      account_key(account: string): Promise<RPC.AccountKeyResponse>;
      /**
       * Returns the representative for account
       * @param {string} account - The NANO account address.
       */
      account_representative(account: string): Promise<RPC.AccountRepresentativeResponse>;
      /**
       * Returns the voting weight for account
       * @param {string} account - The NANO account address.
       */
      account_weight(account: string): Promise<RPC.AccountWeightResponse>;
      /**
       * Returns how many RAW is owned and how many have not yet been received by accounts list
       * @param {string[]} accounts - Array of NANO account addresses.
       */
      accounts_balances(accounts: string[]): Promise<RPC.AccountsBalancesResponse>;
      /**
       * Returns a list of pairs of account and block hash representing the head block for accounts list
       * @param {string[]} accounts - Array of NANO account addresses.
       */
      accounts_frontiers(accounts: string[]): Promise<RPC.AccountsFrontiersResponse>;
      /**
       * Returns a list of block hashes which have not yet been received by these accounts
       * @param {string[]} accounts - Array of NANO account addresses
       * @param {number} count - Max count of block hashes to return
       * @param {params} params - Optional params for RPC request
       */
      accounts_pending(accounts: string[], count?: number, params?: {
          threshold?: string;
          source?: boolean;
          include_active?: boolean;
          sorting?: boolean;
          include_only_confirmed?: boolean;
      }): Promise<RPC.AccountsPendingResponse>;
      /**
       * Returns the difficulty values
       * @param {boolean} include_trend - Include the trend of difficulty seen on the network
       */
      active_difficulty(include_trend?: boolean): Promise<RPC.ActiveDifficultyResponse>;
      /**
       * Returns how many rai are in the public supply
       */
      available_supply(): Promise<RPC.AvailableSupplyResponse>;
      /**
       * Retrieves a json representation of block
       * @param {string} hash - A block hash.
       * @param {boolean} json_block - Response will contain a JSON subtree instead of a JSON string.
       */
      block(hash: string, json_block?: boolean): Promise<RPC.BlockResponse>;
      /**
       * Returns the account containing block
       * @param {string} hash - A block hash.
       */
      block_account(hash: string): Promise<RPC.BlockAccountResponse>;
      /**
       * Request confirmation for block from known online representative nodes.
       * @param {string} hash - A block hash.
       */
      block_confirm(hash: string): Promise<RPC.BlockConfirmResponse>;
      /**
       * Reports the number of blocks in the ledger and unchecked synchronizing blocks
       */
      block_count(): Promise<RPC.BlockCountResponse>;
      /**
       * Retrieves a json representations of blocks
       * @param {string[]} hashes - A list of block hashes.
       * @param {boolean} json_block - Response will contain a JSON subtree instead of a JSON string.
       */
      blocks(hashes: string[], json_block?: boolean): Promise<RPC.BlocksResponse>;
      /**
       * Retrieves a json representations of block with more data than in `blocks`
       * @param {string[]} hashes - A list of block hashes.
       * @param {params} params - Optional params for RPC request
       */
      blocks_info(hashes: string[], params?: {
          json_block?: boolean;
          pending?: boolean;
          source?: boolean;
          balance?: boolean;
          include_not_found?: boolean;
      }): Promise<RPC.BlocksInfoResponse>;
      /**
       * Returns a list of block hashes in the account chain starting at block up to count
       * @param {string} block - A block hash.
       * @param {number} count - Max count of items to return.
       * @param {params} params - Optional params for RPC request
       */
      chain(block: string, count?: number, params?: {
          offset: boolean;
          reverse: boolean;
      }): Promise<RPC.ChainResponse>;
      /**
       * Returns information about node elections.
       * @param {boolean} peer_details - Add peer details included in summation of peers_stake_total.
       */
      confirmation_quorum(peer_details?: boolean): Promise<RPC.ConfirmationQuorumResponse>;
      /**
       * Returns a list of pairs of delegator names given account a representative and its balance
       * @param {string} account - The NANO account address.
       */
      delegators(account: string): Promise<RPC.DelegatorsResponse>;
      /**
       * Get number of delegators for a specific representative account
       * @param {string} account - The NANO account address.
       */
      delegators_count(account: string): Promise<RPC.DelegatorsCountResponse>;
      /**
       * Returns a list of pairs of account and block hash representing the head block starting at account up to count
       * @param {string} account - The NANO account address.
       * @param {number} count - How much items to get from the list. (defaults to 1)
       */
      frontiers(account: string, count?: number): Promise<RPC.FrontiersResponse>;
      /**
       * Reports the number of accounts in the ledger
       */
      frontier_count(): Promise<RPC.FrontierCountResponse>;
      /**
       * Divide a raw amount down by the krai ratio.
       * @param {string} amount - An amount to be converted.
       */
      krai_from_raw(amount: string): Promise<RPC.UnitConversionResponse>;
      /**
       * Multiply an krai amount by the krai ratio.
       * @param {string} amount - An amount to be converted.
       */
      krai_to_raw(amount: string): Promise<RPC.UnitConversionResponse>;
      /**
       * Divide a raw amount down by the Mrai ratio.
       * @param {string} amount - An amount to be converted.
       */
      mrai_from_raw(amount: string): Promise<RPC.UnitConversionResponse>;
      /**
       * Multiply an Mrai amount by the Mrai ratio.
       * @param {string} amount - An amount to be converted.
       */
      mrai_to_raw(amount: string): Promise<RPC.UnitConversionResponse>;
      /**
       * Returns a list of pairs of online peer IPv6:port and its node protocol network version
       * @param {boolean} peer_details - Include network version and node ID
       */
      peers<T extends RPC.PeersResponseDetails | undefined>(peer_details?: boolean): Promise<RPC.PeersResponse<T>>;
      /**
       * Divide a raw amount down by the rai ratio.
       * @param {string} amount - An amount to be converted.
       */
      rai_from_raw(amount: string): Promise<RPC.UnitConversionResponse>;
      /**
       * Multiply an rai amount by the rai ratio.
       * @param {string} amount - An amount to be converted.
       */
      rai_to_raw(amount: string): Promise<RPC.UnitConversionResponse>;
      /**
       * Returns a list of pairs of representative and its voting weight
       * @param {number} count - Count of items to return. (Defaults to 1)
       * @param {boolean} sorting - Sort the returned results by DESC.
       */
      representatives(count?: number, sorting?: boolean): Promise<RPC.RepresentativesResponse>;
      /**
       * Returns a list of online representative accounts that have voted recently
       * @param {boolean} weight - Return voting weight for each representative.
       */
      representatives_online(weight?: boolean): Promise<RPC.RepresentativesOnlineResponse | RPC.RepresentativesOnlineWeightResponse>;
      /**
       * Check whether account is a valid account number using checksum.
       * @param {string} account - The NANO account address.
       */
      validate_account_number(account: string): Promise<RPC.ValidateAccountNumberResponse>;
      /**
       * Returns version information for RPC, Store, Protocol (network),
       */
      version(): Promise<RPC.VersionResponse>;
      /**
       * Return node uptime in seconds
       */
      uptime(): Promise<RPC.UptimeResponse>;
  }
}
