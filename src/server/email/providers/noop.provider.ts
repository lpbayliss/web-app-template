import { Logger } from "#core";
import type { EmailProvider } from "../email.service";

/** Logs instead of sending. Only allowed outside production (see Config). */
export function createNoopProvider(): EmailProvider {
  const log = Logger.child({ module: "email" });
  return {
    name: "noop",
    async send(message) {
      const id = `noop-${Date.now()}`;
      log.info(
        {
          to: message.to,
          subject: message.subject,
          id,
        },
        "email suppressed (noop provider)",
      );
      return { id };
    },
  };
}
