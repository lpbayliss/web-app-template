import { AnimatePresence } from "motion/react";
import { useIntl } from "react-intl";
import { TaskForm } from "./task-form.component";
import { TaskItem } from "./task-item.component";
import { useCreateTask, useRemoveTask, useTasks, useToggleTask } from "./use-tasks.hook";

export function TaskList() {
  const intl = useIntl();
  const tasks = useTasks();
  const create = useCreateTask();
  const toggle = useToggleTask();
  const remove = useRemoveTask();

  const open = tasks.data?.filter((t) => !t.completed).length ?? 0;

  return (
    <div className="space-y-6">
      <TaskForm onSubmit={(input) => create.mutateAsync(input)} />
      <p className="text-sm text-muted" aria-live="polite">
        {intl.formatMessage({ id: "tasks.count" }, { count: open })}
      </p>
      {tasks.isError && (
        <p role="alert" className="text-sm text-danger">
          {intl.formatMessage({ id: "tasks.loadFailed" })}
        </p>
      )}
      {tasks.data?.length === 0 && (
        <p className="text-muted">{intl.formatMessage({ id: "tasks.empty" })}</p>
      )}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {tasks.data?.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={(t) => toggle.mutate({ id: t.id, completed: !t.completed })}
              onRemove={(t) => remove.mutate({ id: t.id })}
            />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
