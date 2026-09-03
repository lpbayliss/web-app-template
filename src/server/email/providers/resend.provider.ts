import { Resend } from "resend";
import type { EmailProvider } from "../email.service";

/** Production delivery through Resend (https://resend.com). */
export function createResendProvider(apiKey: string): EmailProvider {
  const resend = new Resend(apiKey);
  return {
    name: "resend",
    async send(message) {
      const { data, error } = await resend.emails.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      if (error || !data) throw new Error(`Resend: ${error?.message ?? "no response"}`);
      return { id: data.id };
    },
  };
}
