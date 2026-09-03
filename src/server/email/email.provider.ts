import { Config } from "#core";
import type { EmailProvider } from "./email.service";
import { createNoopProvider } from "./providers/noop.provider";
import { createResendProvider } from "./providers/resend.provider";
import { createSmtpProvider } from "./providers/smtp.provider";

/** Pick the provider from configuration (see EMAIL_PROVIDER / RESEND_API_KEY / SMTP_URL). */
export function createEmailProvider(email: typeof Config.email = Config.email): EmailProvider {
  switch (email.provider) {
    case "resend":
      return createResendProvider(email.resendApiKey ?? "");
    case "smtp":
      return createSmtpProvider(email.smtpUrl ?? "");
    case "noop":
      return createNoopProvider();
  }
}
