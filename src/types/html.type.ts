export type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; attrs: Record<string, string> }
  | { kind: "close"; name: string };
