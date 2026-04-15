/**
 * Telegram notifications for agent-team task lifecycle.
 *
 * Env vars (loaded from agent-team.json → .env fallback):
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHAT_ID    — your personal/group chat ID
 */

export enum NotifyStatus {
  Started = "started",
  Done = "done",
  Failed = "failed",
  Progress = "progress",
  Review = "review",
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface NotifyOptions {
  agent: string;
  task: string;
  status: NotifyStatus;
  detail?: string;
}

const ICONS: Record<NotifyStatus, string> = {
  [NotifyStatus.Started]: "\u{1F680}",
  [NotifyStatus.Progress]: "\u{2699}\uFE0F",
  [NotifyStatus.Done]: "\u{2705}",
  [NotifyStatus.Failed]: "\u{274C}",
  [NotifyStatus.Review]: "\u{1F440}",
};

export function buildMessage(opts: NotifyOptions): string {
  const icon = ICONS[opts.status];
  const time = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const detail = opts.detail ? `\n\u{1F4AC} ${opts.detail}` : "";

  return (
    `${icon} <b>[${opts.agent}] ${opts.status.toUpperCase()}</b>` +
    ` \u{2014} ${time}\n\u{1F4CB} ${opts.task}${detail}`
  );
}

/**
 * Send a Telegram notification. Reads config from the provided
 * TelegramConfig or falls back to env vars.
 * Never throws — logs warnings on failure so task execution continues.
 */
export async function notify(
  opts: NotifyOptions,
  config?: TelegramConfig,
): Promise<void> {
  const token = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return;
  }

  const text = buildMessage(opts);

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn("[telegram] Send failed:", body);
    }
  } catch (e: unknown) {
    console.warn(
      "[telegram] Network error:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** Convenience wrappers matching task lifecycle events. */
export const tg = {
  started: (agent: string, task: string, cfg?: TelegramConfig) =>
    notify({ status: NotifyStatus.Started, agent, task }, cfg),

  done: (agent: string, task: string, detail?: string, cfg?: TelegramConfig) =>
    notify({ status: NotifyStatus.Done, agent, task, detail }, cfg),

  failed: (
    agent: string,
    task: string,
    detail?: string,
    cfg?: TelegramConfig,
  ) => notify({ status: NotifyStatus.Failed, agent, task, detail }, cfg),

  progress: (
    agent: string,
    task: string,
    detail?: string,
    cfg?: TelegramConfig,
  ) => notify({ status: NotifyStatus.Progress, agent, task, detail }, cfg),

  review: (agent: string, task: string, cfg?: TelegramConfig) =>
    notify({ status: NotifyStatus.Review, agent, task }, cfg),
};
