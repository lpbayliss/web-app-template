import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import winston from "winston";
import { Context } from "./context";
import { createLogger, type LogFormat } from "./logger";

function capture(format: LogFormat) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trimEnd());
      callback();
    },
  });
  const logger = createLogger({
    level: "debug",
    format,
    color: false,
    transports: [new winston.transports.Stream({ stream })],
  });
  return { logger, lines };
}

describe("Logger (pretty)", () => {
  it("emits a single line with key=value metadata", () => {
    const { logger, lines } = capture("pretty");
    logger.info("hello world", { count: 3, name: "a b", flag: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3} INFO {2}hello world count=3 name="a b" flag=true$/,
    );
  });

  it("merges request context ahead of other metadata", () => {
    const { logger, lines } = capture("pretty");
    Context.run({ requestId: "req-1", userId: "u-1" }, () => {
      logger.debug("inside", { extra: 1 });
    });
    expect(lines[0]).toContain("DEBUG inside requestId=req-1");
    expect(lines[0]).toContain("userId=u-1");
    expect(lines[0]).toContain("extra=1");
  });

  it("does not let context override explicit metadata", () => {
    const { logger, lines } = capture("pretty");
    Context.run({ requestId: "ctx" }, () => logger.info("x", { requestId: "explicit" }));
    expect(lines[0]).toContain("requestId=explicit");
    expect(lines[0]).not.toContain("requestId=ctx");
  });

  it("appends error stacks on indented lines", () => {
    const { logger, lines } = capture("pretty");
    logger.error("boom", new Error("kaboom"));
    const [first, ...rest] = lines[0]!.split("\n");
    expect(first).toContain("ERROR boom");
    expect(rest[0]).toMatch(/^ {4}Error: kaboom/);
  });

  it("serialises nested objects as JSON", () => {
    const { logger, lines } = capture("pretty");
    logger.warn("nested", { meta: { a: 1, b: [1, 2] } });
    expect(lines[0]).toContain('meta={"a":1,"b":[1,2]}');
  });
});

describe("Logger (json)", () => {
  it("emits structured JSON including context", () => {
    const { logger, lines } = capture("json");
    Context.run({ requestId: "r" }, () => logger.info("structured", { n: 1 }));
    const record = JSON.parse(lines[0]!);
    expect(record).toMatchObject({ level: "info", message: "structured", n: 1, requestId: "r" });
    expect(typeof record.timestamp).toBe("string");
  });

  it("includes the stack for errors", () => {
    const { logger, lines } = capture("json");
    logger.error("fail", new Error("bad"));
    const record = JSON.parse(lines[0]!);
    expect(record.stack).toContain("Error: bad");
  });
});
