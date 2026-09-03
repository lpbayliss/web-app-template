import nodemailer from "nodemailer";
import type { EmailProvider } from "../email.service";

/**
 * Any SMTP relay. Locally this is Mailpit (`smtp://localhost:1025`), whose REST API
 * (`GET http://localhost:8025/api/v1/messages`) lets tests and agents inspect what was sent.
 */
export function createSmtpProvider(url: string): EmailProvider {
  const transport = nodemailer.createTransport(url);
  return {
    name: "smtp",
    async send(message) {
      const info = await transport.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { id: info.messageId };
    },
  };
}
