import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Config, Logger, Metrics } from "#core";

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage & { from: string }): Promise<{ id: string }>;
}

/** A rendered-once template: `{ subject, react }` is all a caller needs to hand over. */
export interface EmailTemplate {
  /** Used for metrics/log labels. */
  name: string;
  subject: string;
  react: ReactElement;
}

export function createEmailService(provider: EmailProvider) {
  const log = Logger.child({ module: "email", provider: provider.name });
  const sent = Metrics.counter("emails_sent_total", "Emails handed to the provider", [
    "template",
    "status",
  ]);

  return {
    provider,
    /** Render a React Email template to html + text and send it. */
    async send(to: string, template: EmailTemplate): Promise<{ id: string }> {
      const [html, text] = await Promise.all([
        render(template.react),
        render(template.react, { plainText: true }),
      ]);
      try {
        const result = await provider.send({
          to,
          subject: template.subject,
          html,
          text,
          from: Config.email.from,
        });
        sent.inc({ template: template.name, status: "sent" });
        log.info({ template: template.name, to, messageId: result.id }, "email sent");
        return result;
      } catch (error) {
        sent.inc({ template: template.name, status: "failed" });
        log.error({ template: template.name, to, error }, "email failed");
        throw error;
      }
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
