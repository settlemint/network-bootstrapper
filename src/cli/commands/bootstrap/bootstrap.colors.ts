const RESET = "\x1b[0m";

const applyColor = (value: string, text: string): string => {
  const code = Bun.color(value, "ansi-16m");
  return code ? `${code}${text}${RESET}` : text;
};

const accent = (text: string) => applyColor("#60a5fa", text);
const label = (text: string) => applyColor("#f472b6", text);
const success = (text: string) => applyColor("#34d399", text);
const muted = (text: string) => applyColor("#94a3b8", text);

export { accent, applyColor, label, muted, RESET, success };
