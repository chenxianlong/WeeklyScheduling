import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { LoaderCircle } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...values: Array<string | false | null | undefined>) {
  return twMerge(clsx(values));
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand-700 text-white hover:bg-brand-800",
        variant === "secondary" &&
          "border border-slate-300 bg-white text-ink-900 hover:border-brand-600 hover:text-brand-700",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-ink-900",
        variant === "danger" && "bg-red-700 text-white hover:bg-red-800",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[10px] border border-line bg-white shadow-soft", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition hover:border-slate-400 focus:border-brand-600",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-700">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-[10px] border border-dashed border-slate-300 bg-white/50 px-6 py-10 text-center">
      <div>
        <Icon className="mx-auto mb-4 size-8 text-slate-400" />
        <h3 className="font-serif-cn text-lg font-bold text-ink-900">{title}</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="grid min-h-64 place-items-center" role="status" aria-label="加载中">
      <LoaderCircle className="size-7 animate-spin text-brand-700" />
    </div>
  );
}
