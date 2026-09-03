import { expect } from "@playwright/test";

/**
 * Thin client for Mailpit's REST API (https://mailpit.axllent.org/docs/api-v1/).
 * The same endpoints work for humans and agents: `curl $MAILPIT_API_URL/api/v1/messages`.
 */
export interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string; Name: string }[];
  Snippet: string;
}

export class Mailpit {
  private readonly base: string;

  constructor(base = process.env.MAILPIT_API_URL ?? "http://localhost:8026") {
    this.base = base.replace(/\/$/, "");
  }

  async deleteAll(): Promise<void> {
    await fetch(`${this.base}/api/v1/messages`, { method: "DELETE" });
  }

  async search(query: string): Promise<MailpitMessage[]> {
    const res = await fetch(`${this.base}/api/v1/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
    return ((await res.json()) as { messages: MailpitMessage[] }).messages;
  }

  async text(id: string): Promise<string> {
    const res = await fetch(`${this.base}/api/v1/message/${id}`);
    return ((await res.json()) as { Text: string }).Text;
  }

  async html(id: string): Promise<string> {
    const res = await fetch(`${this.base}/api/v1/message/${id}`);
    return ((await res.json()) as { HTML: string }).HTML;
  }

  /** Poll until a message for `to` with a subject containing `subject` arrives. */
  async waitFor(to: string, subject: string): Promise<MailpitMessage> {
    let found: MailpitMessage | undefined;
    await expect
      .poll(
        async () => {
          const messages = await this.search(`to:${to}`);
          found = messages.find((m) => m.Subject.includes(subject));
          return Boolean(found);
        },
        { timeout: 15_000, message: `email "${subject}" to ${to}` },
      )
      .toBe(true);
    return found as MailpitMessage;
  }
}
