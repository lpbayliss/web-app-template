/** @jsxRuntime automatic @jsxImportSource react */
// The pragmas pin the automatic JSX runtime per file. tsx (esbuild) reads the root tsconfig.json, a
// solution file with no compilerOptions, so without them dev/migrate/seed fall back to classic JSX
// and fail with "React is not defined". Copy both lines into any new server-side .tsx file.

import { Button, Heading, Text } from "react-email";
import type { EmailTemplate } from "../email.service";
import { EmailLayout } from "./layout.email";

export interface WelcomeEmailProps {
  name: string;
  appUrl: string;
}

function WelcomeEmail({ name, appUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout preview={`Welcome aboard, ${name}`}>
      <Heading as="h1" style={{ fontSize: "22px" }}>
        Welcome, {name}!
      </Heading>
      <Text>Your account is ready. Jump back in whenever you like.</Text>
      <Button
        href={appUrl}
        style={{
          backgroundColor: "#111827",
          color: "#ffffff",
          padding: "12px 20px",
          borderRadius: "6px",
        }}
      >
        Open the app
      </Button>
    </EmailLayout>
  );
}

export function welcomeEmail(props: WelcomeEmailProps): EmailTemplate {
  return { name: "welcome", subject: `Welcome, ${props.name}`, react: <WelcomeEmail {...props} /> };
}
