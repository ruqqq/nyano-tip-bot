import { BlockRepresentation } from "nanocurrency";

export type ExtendedBlockRepresentation = BlockRepresentation & {
  subtype: "send" | "receive" | "change" | "epoch";
  hash: string;
};
