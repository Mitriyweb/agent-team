export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  assistant(text: string): void;
  tool(name: string, input?: unknown): void;
}

export function createLogger(prefix: string): Logger {
  const tag = `[${prefix}]`;

  return {
    info(msg) {
      console.log(`${tag} ${msg}`);
    },
    warn(msg) {
      console.warn(`\x1b[33m${tag} WARN: ${msg}\x1b[0m`);
    },
    error(msg) {
      console.error(`\x1b[31m${tag} ERROR: ${msg}\x1b[0m`);
    },
    assistant(text) {
      const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;
      console.log(`\x1b[36m${tag} > ${preview}\x1b[0m`);
    },
    tool(name, input) {
      const inputStr = input ? ` | ${JSON.stringify(input).slice(0, 150)}` : "";
      console.log(`\x1b[35m${tag} TOOL: ${name}${inputStr}\x1b[0m`);
    },
  };
}
