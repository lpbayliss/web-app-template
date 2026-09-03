import { z } from "zod";

/** Mirrors the Better Auth server rules (minPasswordLength: 10) so forms fail fast client-side. */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
const passwordSchema = z.string().min(10, "Use at least 10 characters").max(128);

export const signInSchema = z.object({ email: emailSchema, password: passwordSchema });
export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(1, "Tell us your name").max(80),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
