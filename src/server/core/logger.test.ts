import { describe, expect, it } from "vitest";
import { Context } from "./context";
import { createLogger, type LogFormat } from "./logger";

function capture(format: LogFormat) {
  const lines: string[] = [];
  const logger = createLogger({
    level: "debug",
    format,
    color: false,
    destination: { write: (line: string) => void lines.push(line.trimEnd()) },
  });
  return { logger, lines };
}

describe("Logger (pretty)", () => {
  it("emits a single line with key=value metadata", () => {
    const { logger, lines } = capture("pretty");
    logger.info({ count: 3, name: "a b", flag: true }, "hello world");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3} INFO {2}hello world count=3 name="a b" flag=true$/,
    );
  });

  it("supports the custom http level", () => {
    const { logger, lines } = capture("pretty");
    logger.http({ status: 200 }, "request completed");
    expect(lines[0]).toContain("HTTP  request completed status=200");
  });

  it("merges request context ahead of other metadata", () => {
    const { logger, lines } = capture("pretty");
    Context.run({ requestId: "req-1", userId: "u-1" }, () => {
      logger.debug({ extra: 1 }, "inside");
    });
    expect(lines[0]).toContain("DEBUG inside requestId=req-1");
    expect(lines[0]).toContain("userId=u-1");
    expect(lines[0]).toContain("extra=1");
  });

  it("does not let context override explicit metadata", () => {
    const { logger, lines } = capture("pretty");
    Context.run({ requestId: "ctx" }, () => logger.info({ requestId: "explicit" }, "x"));
    expect(lines[0]).toContain("requestId=explicit");
    expect(lines[0]).not.toContain("requestId=ctx");
  });

  it("appends error stacks on indented lines", () => {
    const { logger, lines } = capture("pretty");
    logger.error({ error: new Error("kaboom") }, "boom");
    const [first, ...rest] = lines[0]!.split("\n");
    expect(first).toBe(`${first!.slice(0, 12)} ERROR boom`);
    expect(rest[0]).toMatch(/^ {4}Error: kaboom/);
  });

  it("accepts an error as the first argument", () => {
    const { logger, lines } = capture("pretty");
    logger.error(new Error("kaboom"), "boom");
    expect(lines[0]).toContain("ERROR boom");
    expect(lines[0]).toContain("    Error: kaboom");
  });

  it("serialises nested objects as JSON", () => {
    const { logger, lines } = capture("pretty");
    logger.warn({ meta: { a: 1, b: [1, 2] } }, "nested");
    expect(lines[0]).toContain('meta={"a":1,"b":[1,2]}');
  });

  it("carries child bindings on every line", () => {
    const { logger, lines } = capture("pretty");
    logger.child({ module: "test" }).info("hi");
    expect(lines[0]).toMatch(/INFO {2}hi module=test$/);
  });

  it("respects the configured level", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "warn",
      format: "pretty",
      destination: { write: (line: string) => void lines.push(line) },
    });
    logger.info("hidden");
    logger.warn("shown");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("WARN  shown");
  });
});

describe("Logger (json)", () => {
  it("emits structured JSON including context", () => {
    const { logger, lines } = capture("json");
    Context.run({ requestId: "r" }, () => logger.info({ n: 1 }, "structured"));
    const record = JSON.parse(lines[0]!);
    expect(record).toMatchObject({ level: "info", msg: "structured", n: 1, requestId: "r" });
    expect(record.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("serialises errors under the error key with a stack", () => {
    const { logger, lines } = capture("json");
    logger.error({ error: new Error("bad") }, "fail");
    const record = JSON.parse(lines[0]!);
    expect(record.error).toMatchObject({ type: "Error", message: "bad" });
    expect(record.error.stack).toContain("Error: bad");
  });

  it("puts a leading error under the same key", () => {
    const { logger, lines } = capture("json");
    logger.error(new Error("bad"), "fail");
    const record = JSON.parse(lines[0]!);
    expect(record.error.message).toBe("bad");
    expect(record.msg).toBe("fail");
  });
});
