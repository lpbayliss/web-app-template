import { Logger } from "#core";
import type { EmailProvider } from "../email.service";

/** Logs instead of sending. Only allowed outside production (see Config). */
export function createNoopProvider(): EmailProvider {
  const log = Logger.child({ module: "email" });
  return {
    name: "noop",
    async send(message) {
      const id = `noop-${Date.now()}`;
      log.info("email suppressed (noop provider)", {
        to: message.to,
        subject: message.subject,
        id,
      });
      return { id };
    },
  };
}
