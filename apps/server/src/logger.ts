import { pino } from "pino";

// One JSON object per line (CloudWatch Insights auto-discovers fields); pretty only in a terminal.
// Bigints serialize as raw JSON numbers and lose precision downstream: pass them as strings.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  ...(process.stdout.isTTY && { transport: { target: "pino-pretty" } }),
});
