import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "react-email";

/** Shared chrome for every transactional email. Inline styles only: email clients ignore stylesheets. */
export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f6f6f6",
          fontFamily: "Helvetica, Arial, sans-serif",
          margin: 0,
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            margin: "32px auto",
            padding: "32px",
            maxWidth: "520px",
          }}
        >
          {children}
          <Section style={{ marginTop: "32px" }}>
            <Text style={{ color: "#888888", fontSize: "12px" }}>
              You received this because you have an account.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
