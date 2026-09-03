import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "#core";

const sendMail = vi.hoisted(() => vi.fn(async () => ({ messageId: "<smtp-1>" })));
const resendSend = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const { createEmailProvider } = await import("./email.provider");

const message = {
  from: "App <a@b.c>",
  to: "to@example.com",
  subject: "Hi",
  html: "<p>Hi</p>",
  text: "Hi",
};

function email(overrides: Partial<AppConfig["email"]>): AppConfig["email"] {
  return {
    provider: "noop",
    from: "App <a@b.c>",
    resendApiKey: undefined,
    smtpUrl: undefined,
    ...overrides,
  };
}

describe("createEmailProvider", () => {
  it("builds the SMTP provider and forwards the message", async () => {
    const provider = createEmailProvider(
      email({ provider: "smtp", smtpUrl: "smtp://localhost:1025" }),
    );
    expect(provider.name).toBe("smtp");
    expect(await provider.send(message)).toEqual({ id: "<smtp-1>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to@example.com", subject: "Hi" }),
    );
  });

  it("builds the Resend provider and surfaces API errors", async () => {
    const provider = createEmailProvider(email({ provider: "resend", resendApiKey: "re_test" }));
    expect(provider.name).toBe("resend");
    resendSend.mockResolvedValueOnce({ data: { id: "re-1" }, error: null });
    expect(await provider.send(message)).toEqual({ id: "re-1" });
    resendSend.mockResolvedValueOnce({ data: null, error: { message: "invalid from" } });
    await expect(provider.send(message)).rejects.toThrow("Resend: invalid from");
  });

  it("builds the noop provider that only logs", async () => {
    const provider = createEmailProvider(email({ provider: "noop" }));
    expect(provider.name).toBe("noop");
    expect((await provider.send(message)).id).toMatch(/^noop-/);
  });
});
