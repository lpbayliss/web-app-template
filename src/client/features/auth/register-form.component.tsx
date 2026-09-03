import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useIntl } from "react-intl";
import { Button } from "#client/components/button.component";
import { Input } from "#client/components/input.component";
import { authClient } from "#client/lib/auth.client";
import { type SignUpInput, signUpSchema } from "#shared/schemas/auth.schema";

export interface RegisterFormProps {
  onSuccess: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const intl = useIntl();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await authClient.signUp.email(values);
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
      aria-label={intl.formatMessage({ id: "auth.signUp" })}
    >
      <Input
        label={intl.formatMessage({ id: "auth.name" })}
        autoComplete="name"
        error={form.formState.errors.name?.message}
        {...form.register("name")}
      />
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
        autoComplete="new-password"
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {intl.formatMessage({ id: "auth.failed" }, { message: serverError })}
        </p>
      )}
      <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
        {intl.formatMessage({ id: "auth.signUp" })}
      </Button>
    </form>
  );
}
