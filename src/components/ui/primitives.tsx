import { type ReactNode } from "react";
import clsx from "clsx";

export function Card({
  children,
  className,
  elevated = false,
}: {
  children?: ReactNode;
  className?: string;
  /** Deeper shadow for the one "hero" card on a page, instead of every card. */
  elevated?: boolean;
}) {
  return (
    <div
      className={clsx("rounded-3xl border border-[var(--border)] bg-[var(--surface)]", className)}
      style={{ boxShadow: elevated ? "var(--shadow-ambient-lg)" : "var(--shadow-ambient)" }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  className,
  disabled,
  fullWidth,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const variants = {
    primary: "bg-gradient-to-b from-[var(--accent-2)] to-[var(--accent)] text-[var(--accent-foreground)] hover:brightness-105",
    secondary: "bg-[var(--surface-2)] text-[var(--foreground)] hover:brightness-95",
    ghost: "bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-2)]",
    danger: "bg-[var(--danger)] text-white hover:brightness-110",
  };
  const sizes = { sm: "text-sm px-3 py-2 rounded-xl", md: "text-sm px-4 py-3 rounded-2xl", lg: "text-base px-5 py-4 rounded-2xl" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "btn-3d font-bold disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none select-none",
        variants[variant],
        variant === "ghost" && "!shadow-none",
        sizes[size],
        fullWidth && "w-full",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const tones = {
    default: "bg-[var(--surface-2)] text-[var(--muted)]",
    success: "bg-[var(--success-bg)] text-[var(--success)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
    danger: "bg-[var(--danger-bg)] text-[var(--danger)]",
    info: "bg-[var(--info-bg)] text-[var(--info)]",
  };
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm font-semibold text-[var(--muted)]">
        {label} {required && <span className="text-[var(--danger)]">*</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-a20)] placeholder:text-[var(--muted)]";
