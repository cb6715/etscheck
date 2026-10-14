import { type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";

export function Card({
  children,
  className,
  elevated = false,
}: {
  children?: ReactNode;
  className?: string;
  /** Stronger glow + shadow for the one "hero" card on a page, instead of every card. */
  elevated?: boolean;
}) {
  return (
    <div className={clsx("rounded-[28px]", elevated ? "glass-strong" : "glass", className)}>{children}</div>
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
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Renders as a Next.js Link styled identically to the button, instead
   * of a <button> — for navigation, never for an action. Avoids nesting a
   * <button> inside an <a> (invalid HTML) when a CTA both looks like a
   * button and navigates. */
  href?: string;
}) {
  const variants = {
    primary:
      "bg-gradient-to-b from-[var(--accent-2)] to-[var(--accent)] text-[var(--accent-foreground)] hover:brightness-105",
    secondary: "glass text-[var(--foreground)] hover:brightness-95",
    ghost: "bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-2)]",
    danger: "bg-[var(--danger)] text-white hover:brightness-110",
  };
  const sizes = { sm: "text-sm px-4 py-2 rounded-full", md: "text-sm px-5 py-3 rounded-full", lg: "text-base px-6 py-4 rounded-full" };
  const classes = clsx(
    "btn-3d font-bold disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none select-none",
    variants[variant],
    (variant === "ghost" || variant === "secondary") && "!shadow-none",
    variant === "primary" && "shadow-[0_0_24px_-4px_var(--accent-a40)]",
    sizes[size],
    fullWidth && "w-full",
    "inline-flex items-center justify-center",
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
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
  "glass w-full rounded-2xl px-4 py-3 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-a20)] placeholder:text-[var(--muted)]";
