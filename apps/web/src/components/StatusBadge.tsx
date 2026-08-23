import {
  submissionStatusLabels,
  submissionStatusTone,
  type SubmissionStatus,
} from "@shared/index";
import { cn } from "./ui";

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const tone = submissionStatusTone[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "neutral" && "bg-slate-100 text-slate-600",
        tone === "warning" && "bg-amber-100 text-amber-800",
        tone === "danger" && "bg-red-100 text-red-800",
        tone === "success" && "bg-emerald-100 text-emerald-800",
      )}
    >
      {submissionStatusLabels[status]}
    </span>
  );
}
