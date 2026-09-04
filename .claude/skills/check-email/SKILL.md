---
name: check-email
description: Inspect emails the app sent in development or tests through Mailpit's REST API. Use when verifying a welcome or password-reset email was delivered, reading a message body or link, or clearing the inbox.
---

# Checking sent email (Mailpit)

Mailpit receives everything the app sends via SMTP. Two instances exist:

| Environment | SMTP | API / UI |
| --- | --- | --- |
| dev (`docker compose up -d`) | :1025 | http://localhost:8025 |
| test profile (`--profile test`) | :1026 | http://localhost:8026 |

## Commands

```bash
# newest messages (ID, From, To, Subject, Snippet)
curl -s localhost:8025/api/v1/messages | node -e 'JSON.parse(require("fs").readFileSync(0)).messages.forEach(m=>console.log(m.ID, m.To[0].Address, "|", m.Subject))'

# search (to:, from:, subject:, plain text)
curl -s "localhost:8025/api/v1/search?query=to:user@example.com"

# full message: HTML, Text, headers
curl -s localhost:8025/api/v1/message/<ID>

# extract the first link from the text body (e.g. password reset URL)
curl -s localhost:8025/api/v1/message/<ID> | node -e 'const m=JSON.parse(require("fs").readFileSync(0));console.log(m.Text.match(/https?:\/\/\S+/)?.[0])'

# empty the inbox
curl -s -X DELETE localhost:8025/api/v1/messages
```

## Notes

- Welcome emails are sent by the `send-welcome-email` job, so they need the worker running (`pnpm dev` includes it; `JOBS_INLINE=true` folds it into the web process). If nothing arrives, check Bull Board at http://localhost:3003 or `pnpm dev` logs for `job failed`.
- Playwright uses the same API through `e2e/fixtures/mailpit.fixture.ts` (`mailpit.waitFor(to, subject)`).
- Templates live in `src/server/email/templates/*.email.tsx` (react-email); preview them by rendering in a test or Storybook.
