import { WIND_TOOLS } from "../constants";

export type WindTool = (typeof WIND_TOOLS)[number];

export type WindToolbarPreset = "full" | "writing" | "basic" | "minimal";
