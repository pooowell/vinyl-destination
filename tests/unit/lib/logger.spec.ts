import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test the logger module with different env vars,
// so we re-import it fresh for each test via dynamic import + module reset.

describe("logger", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function getLogger() {
    const mod = await import("@/lib/logger");
    return mod.logger;
  }

  it("exposes debug, info, warn, and error methods", async () => {
    const logger = await getLogger();
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("calls all 4 methods without throwing", async () => {
    process.env.LOG_LEVEL = "debug";
    const logger = await getLogger();
    expect(() => logger.debug("d")).not.toThrow();
    expect(() => logger.info("i")).not.toThrow();
    expect(() => logger.warn("w")).not.toThrow();
    expect(() => logger.error("e")).not.toThrow();
  });

  it("suppresses debug when LOG_LEVEL=info", async () => {
    process.env.LOG_LEVEL = "info";
    const logger = await getLogger();
    logger.debug("should not appear");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("allows info when LOG_LEVEL=info", async () => {
    process.env.LOG_LEVEL = "info";
    const logger = await getLogger();
    logger.info("visible");
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("suppresses debug and info when LOG_LEVEL=warn", async () => {
    process.env.LOG_LEVEL = "warn";
    const logger = await getLogger();
    logger.debug("nope");
    logger.info("nope");
    expect(console.log).not.toHaveBeenCalled();
    logger.warn("yes");
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("only allows error when LOG_LEVEL=error", async () => {
    process.env.LOG_LEVEL = "error";
    const logger = await getLogger();
    logger.debug("no");
    logger.info("no");
    logger.warn("no");
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    logger.error("yes");
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("includes context in dev output", async () => {
    process.env.LOG_LEVEL = "debug";
    process.env.NODE_ENV = "development";
    const logger = await getLogger();
    logger.info("test msg", { userId: "abc", count: 3 });
    const call = vi.mocked(console.log).mock.calls[0][0] as string;
    expect(call).toContain("test msg");
    expect(call).toContain('"userId":"abc"');
    expect(call).toContain('"count":3');
  });

  it("outputs valid JSON in production mode", async () => {
    process.env.LOG_LEVEL = "debug";
    process.env.NODE_ENV = "production";
    const logger = await getLogger();
    logger.error("boom", { code: 500 });
    const call = vi.mocked(console.error).mock.calls[0][0] as string;
    const parsed = JSON.parse(call);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("boom");
    expect(parsed.context).toEqual({ code: 500 });
    expect(parsed.timestamp).toBeDefined();
  });

  it("defaults to debug level in development", async () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "development";
    const logger = await getLogger();
    logger.debug("dev debug");
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("defaults to info level in production", async () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "production";
    const logger = await getLogger();
    logger.debug("should be suppressed");
    expect(console.log).not.toHaveBeenCalled();
    logger.info("should appear");
    expect(console.log).toHaveBeenCalledTimes(1);
  });
});
