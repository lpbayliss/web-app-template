import { Logger } from "./logger";

export type ShutdownHook = () => Promise<void> | void;

interface Registered {
  name: string;
  hook: ShutdownHook;
}

/**
 * Ordered graceful shutdown. Hooks run in reverse registration order (last opened,
 * first closed): stop accepting traffic, then drain in-flight work, then close the DB.
 */
export function createShutdown(options: { timeoutMs: number; exit?: (code: number) => void }) {
  const hooks: Registered[] = [];
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let running: Promise<void> | undefined;

  const register = (name: string, hook: ShutdownHook): (() => void) => {
    const entry = { name, hook };
    hooks.push(entry);
    return () => {
      const index = hooks.indexOf(entry);
      if (index >= 0) hooks.splice(index, 1);
    };
  };

  const run = async (reason: string): Promise<number> => {
    let failed = false;
    Logger.info("shutdown started", { reason, hooks: hooks.length });
    for (const { name, hook } of [...hooks].reverse()) {
      try {
        await hook();
        Logger.debug("shutdown hook finished", { hook: name });
      } catch (error) {
        failed = true;
        Logger.error("shutdown hook failed", { hook: name, error });
      }
    }
    return failed ? 1 : 0;
  };

  const trigger = (reason: string): Promise<void> => {
    if (running) return running;
    const timer = setTimeout(() => {
      Logger.error("shutdown timed out, forcing exit", { timeoutMs: options.timeoutMs });
      exit(2);
    }, options.timeoutMs);
    timer.unref();
    running = run(reason).then((code) => {
      clearTimeout(timer);
      exit(code);
    });
    return running;
  };

  /** Wire SIGTERM/SIGINT and fatal error handlers. Call once from main(). */
  const install = () => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.once(signal, () => void trigger(signal));
    }
    process.on("unhandledRejection", (reason) => {
      Logger.error("unhandled rejection", { error: reason });
      void trigger("unhandledRejection");
    });
    process.on("uncaughtException", (error) => {
      Logger.error("uncaught exception", { error });
      void trigger("uncaughtException");
    });
  };

  return { register, trigger, install, run };
}

export type ShutdownManager = ReturnType<typeof createShutdown>;
