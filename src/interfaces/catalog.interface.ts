import { SlashChoice } from "../types";

export interface SlashItem {
  id: SlashChoice;
  label: string;
  hint: string;
  keys: string;
}
