import { BLOCK_TYPES, MARKS } from "../constants";
import { DeltaOp } from "../interfaces";

export type BlockType = (typeof BLOCK_TYPES)[number];

export type MarkName = (typeof MARKS)[number];

export type Delta = DeltaOp[];
