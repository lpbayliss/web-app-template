import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useIntl } from "react-intl";
import { Button } from "#client/components/button.component";
import { Input } from "#client/components/input.component";
import { type CreateTaskInput, createTaskInputSchema } from "#shared/schemas/task.schema";

export interface TaskFormProps {
  onSubmit: (input: CreateTaskInput) => Promise<unknown> | undefined;
}

/** Single-field create form; react-hook-form + the shared Zod schema the server validates with. */
export function TaskForm({ onSubmit }: TaskFormProps) {
  const intl = useIntl();
  const form = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskInputSchema),
    defaultValues: { title: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    form.reset();
  });

  return (
    <form onSubmit={submit} noValidate className="flex items-start gap-2">
      <div className="flex-1">
        <Input
          label={intl.formatMessage({ id: "tasks.placeholder" })}
          placeholder={intl.formatMessage({ id: "tasks.placeholder" })}
          autoComplete="off"
          error={form.formState.errors.title?.message}
          {...form.register("title")}
        />
      </div>
      <Button type="submit" loading={form.formState.isSubmitting} className="mt-6">
        {intl.formatMessage({ id: "tasks.add" })}
      </Button>
    </form>
  );
}
