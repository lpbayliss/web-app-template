import { describe, expect, it, vi } from "vitest";
import { createEmailService, type EmailProvider } from "./email.service";
import { passwordResetEmail } from "./templates/password-reset.email";
import { welcomeEmail } from "./templates/welcome.email";

function fakeProvider(): EmailProvider & { sent: Parameters<EmailProvider["send"]>[0][] } {
  const sent: Parameters<EmailProvider["send"]>[0][] = [];
  return {
    name: "fake",
    sent,
    async send(message) {
      sent.push(message);
      return { id: `msg-${sent.length}` };
    },
  };
}

describe("EmailService", () => {
  it("renders the welcome template to html and text", async () => {
    const provider = fakeProvider();
    const email = createEmailService(provider);
    const result = await email.send(
      "a@example.com",
      welcomeEmail({ name: "Ada", appUrl: "https://app.test" }),
    );
    expect(result.id).toBe("msg-1");
    const [message] = provider.sent;
    expect(message?.to).toBe("a@example.com");
    expect(message?.subject).toBe("Welcome, Ada");
    expect(message?.text).toMatch(/welcome, ada!/i);
    expect(message?.html).toContain('href="https://app.test"');
    expect(message?.text).toContain("Open the app");
    expect(message?.from).toMatch(/@/);
  });

  it("renders the password reset template with the link", async () => {
    const provider = fakeProvider();
    const email = createEmailService(provider);
    await email.send(
      "b@example.com",
      passwordResetEmail({
        name: "Bob",
        resetUrl: "https://app.test/reset?token=abc",
        expiresInMinutes: 60,
      }),
    );
    const [message] = provider.sent;
    expect(message?.subject).toBe("Reset your password");
    expect(message?.html).toContain("https://app.test/reset?token=abc");
    expect(message?.text).toContain("60 minutes");
  });

  it("propagates provider failures", async () => {
    const provider: EmailProvider = {
      name: "broken",
      send: vi.fn(async () => {
        throw new Error("smtp down");
      }),
    };
    const email = createEmailService(provider);
    await expect(
      email.send("c@example.com", welcomeEmail({ name: "C", appUrl: "x" })),
    ).rejects.toThrow("smtp down");
  });
});
