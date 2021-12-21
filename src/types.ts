import { BlockRepresentation } from "nanocurrency";

export type BlockRepresentationWithSubtype = BlockRepresentation & { subtype: "send" | "receive" | "change" | "epoch" };
