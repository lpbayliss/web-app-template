/** @jsxRuntime automatic @jsxImportSource react */
// The pragmas pin the automatic JSX runtime per file. tsx (esbuild) reads the root tsconfig.json, a
// solution file with no compilerOptions, so without them dev/migrate/seed fall back to classic JSX
// and fail with "React is not defined". Copy both lines into any new server-side .tsx file.

import { Button, Heading, Link, Text } from "react-email";
import type { EmailTemplate } from "../email.service";
import { EmailLayout } from "./layout.email";

export interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

function PasswordResetEmail({ name, resetUrl, expiresInMinutes }: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Reset your password">
      <Heading as="h1" style={{ fontSize: "22px" }}>
        Reset your password
      </Heading>
      <Text>Hi {name}, someone asked to reset the password for your account.</Text>
      <Button
        href={resetUrl}
        style={{
          backgroundColor: "#111827",
          color: "#ffffff",
          padding: "12px 20px",
          borderRadius: "6px",
        }}
      >
        Choose a new password
      </Button>
      <Text style={{ fontSize: "13px", color: "#555555" }}>
        This link expires in {expiresInMinutes} minutes. If you did not request it, ignore this
        email. Or copy the link: <Link href={resetUrl}>{resetUrl}</Link>
      </Text>
    </EmailLayout>
  );
}

export function passwordResetEmail(props: PasswordResetEmailProps): EmailTemplate {
  return {
    name: "password-reset",
    subject: "Reset your password",
    react: <PasswordResetEmail {...props} />,
  };
}
