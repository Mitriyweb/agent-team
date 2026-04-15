import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  buildMessage,
  NotifyStatus,
  notify,
  type TelegramConfig,
} from "../../lib/notify.ts";

describe("buildMessage", () => {
  it("includes the agent name in brackets", () => {
    const msg = buildMessage({
      agent: "fe-dev",
      task: "Build page",
      status: NotifyStatus.Started,
    });
    expect(msg).toContain("[fe-dev]");
  });

  it("uppercases the status label", () => {
    const msg = buildMessage({
      agent: "qa",
      task: "Run tests",
      status: NotifyStatus.Done,
    });
    expect(msg).toContain("DONE");
  });

  it("includes task description after clipboard emoji", () => {
    const msg = buildMessage({
      agent: "dev",
      task: "Fix login",
      status: NotifyStatus.Failed,
    });
    expect(msg).toContain("\u{1F4CB} Fix login");
  });

  it("appends detail when provided", () => {
    const msg = buildMessage({
      agent: "dev",
      task: "Build",
      status: NotifyStatus.Failed,
      detail: "Module not found",
    });
    expect(msg).toContain("\u{1F4AC} Module not found");
  });

  it("omits detail line when not provided", () => {
    const msg = buildMessage({
      agent: "dev",
      task: "Build",
      status: NotifyStatus.Done,
    });
    expect(msg).not.toContain("\u{1F4AC}");
  });

  it("uses rocket emoji for started status", () => {
    const msg = buildMessage({
      agent: "a",
      task: "t",
      status: NotifyStatus.Started,
    });
    expect(msg).toStartWith("\u{1F680}");
  });

  it("uses checkmark emoji for done status", () => {
    const msg = buildMessage({
      agent: "a",
      task: "t",
      status: NotifyStatus.Done,
    });
    expect(msg).toStartWith("\u{2705}");
  });

  it("uses cross emoji for failed status", () => {
    const msg = buildMessage({
      agent: "a",
      task: "t",
      status: NotifyStatus.Failed,
    });
    expect(msg).toStartWith("\u{274C}");
  });

  it("uses gear emoji for progress status", () => {
    const msg = buildMessage({
      agent: "a",
      task: "t",
      status: NotifyStatus.Progress,
    });
    expect(msg).toStartWith("\u{2699}");
  });

  it("uses eyes emoji for review status", () => {
    const msg = buildMessage({
      agent: "a",
      task: "t",
      status: NotifyStatus.Review,
    });
    expect(msg).toStartWith("\u{1F440}");
  });
});

describe("notify", () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChat = process.env.TELEGRAM_CHAT_ID;

  afterEach(() => {
    mock.restore();
    if (originalToken) {
      process.env.TELEGRAM_BOT_TOKEN = originalToken;
    } else {
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
    if (originalChat) {
      process.env.TELEGRAM_CHAT_ID = originalChat;
    } else {
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });

  it("skips silently when token is missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const fetchSpy = spyOn(globalThis, "fetch");
    await notify({
      agent: "dev",
      task: "test",
      status: NotifyStatus.Started,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses config over env vars", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const cfg: TelegramConfig = {
      botToken: "test-token",
      chatId: "test-chat",
    };
    await notify(
      { agent: "dev", task: "test", status: NotifyStatus.Done },
      cfg,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain("test-token");
  });

  it("sends POST with HTML parse mode", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const cfg: TelegramConfig = {
      botToken: "tok",
      chatId: "123",
    };
    await notify({ agent: "a", task: "t", status: NotifyStatus.Started }, cfg);

    const callArgs = fetchSpy.mock.calls[0];
    const opts = callArgs?.[1] as RequestInit;
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.parse_mode).toBe("HTML");
    expect(body.chat_id).toBe("123");
  });

  it("logs warning on non-ok response", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    const warnSpy = spyOn(console, "warn");

    const cfg: TelegramConfig = {
      botToken: "bad",
      chatId: "123",
    };
    await notify({ agent: "a", task: "t", status: NotifyStatus.Done }, cfg);

    expect(warnSpy).toHaveBeenCalled();
  });

  it("logs warning on network error without throwing", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const warnSpy = spyOn(console, "warn");

    const cfg: TelegramConfig = {
      botToken: "tok",
      chatId: "123",
    };
    await notify({ agent: "a", task: "t", status: NotifyStatus.Failed }, cfg);

    expect(warnSpy).toHaveBeenCalled();
  });
});
