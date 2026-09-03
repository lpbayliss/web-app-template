import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useIntl } from "react-intl";
import { Button } from "#client/components/button.component";
import { Input } from "#client/components/input.component";
import { authClient } from "#client/lib/auth.client";
import { type SignInInput, signInSchema } from "#shared/schemas/auth.schema";

export interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const intl = useIntl();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      setServerError(error.message ?? "unknown");
      return;
    }
    onSuccess();
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4"
      aria-label={intl.formatMessage({ id: "auth.signIn" })}
    >
      <Input
        label={intl.formatMessage({ id: "auth.email" })}
        type="email"
        autoComplete="email"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <Input
        label={intl.formatMessage({ id: "auth.password" })}
        type="password"
        autoComplete="current-password"
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {intl.formatMessage({ id: "auth.failed" }, { message: serverError })}
        </p>
      )}
      <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
        {intl.formatMessage({ id: form.formState.isSubmitting ? "auth.signingIn" : "auth.signIn" })}
      </Button>
    </form>
  );
}
