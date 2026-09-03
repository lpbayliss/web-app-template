import { motion } from "motion/react";
import { useIntl } from "react-intl";
import { Button } from "#client/components/button.component";
import type { Task } from "#shared/schemas/task.schema";

export interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
}

/** One row. `motion.li` + `layout` lets the parent list animate reorders and removals. */
export function TaskItem({ task, onToggle, onRemove }: TaskItemProps) {
  const intl = useIntl();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-3 rounded-card border border-line bg-surface-raised px-4 py-3"
    >
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        aria-label={intl.formatMessage({
          id: task.completed ? "tasks.markOpen" : "tasks.markDone",
        })}
        className="size-4 accent-accent"
      />
      <span className={task.completed ? "flex-1 text-muted line-through" : "flex-1"}>
        {task.title}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onRemove(task)}>
        {intl.formatMessage({ id: "tasks.delete" })}
      </Button>
    </motion.li>
  );
}
