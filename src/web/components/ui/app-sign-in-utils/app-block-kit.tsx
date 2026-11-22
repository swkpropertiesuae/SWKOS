"use client";

// Shared primitives for the App Sign In block. Written for SWK OS from the block's usage: the upstream kit is not published with the component.
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type AppBlockTheme = "auto" | "light" | "dark";

/** Root classes: container-query context so the block lays out by its own width, plus base colours and type. */
export const blockRoot =
  "@container relative isolate w-full bg-[var(--bjork-bg)] text-[color:var(--bjork-text)] antialiased [font-family:var(--bjork-font,inherit)]";

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]";

// Semantic colours the block reads as --blk-*; derived from the --bjork-* palette so light/dark follow it.
const SEMANTIC_LIGHT: Record<string, string> = {
  "--blk-error": "#c2410c",
  "--blk-error-soft": "var(--bjork-error-bg)",
  "--blk-warning": "#b45309",
  "--blk-success": "#15803d",
  "--blk-success-soft": "rgba(21, 128, 61, 0.1)",
  "--blk-accent-fill": "var(--bjork-accent)",
  "--blk-accent-fill-ink": "var(--bjork-accent-foreground)",
  "--blk-accent-ink": "color-mix(in oklab, var(--bjork-accent) 78%, var(--bjork-text))",
  "--blk-chart-ghost": "var(--bjork-text-faint)",
};
const SEMANTIC_DARK: Record<string, string> = {
  ...SEMANTIC_LIGHT,
  "--blk-error": "#f97366",
  "--blk-warning": "#f5b14c",
  "--blk-success": "#4ade80",
  "--blk-success-soft": "rgba(74, 222, 128, 0.12)",
  "--blk-accent-ink": "color-mix(in oklab, var(--bjork-accent) 82%, white)",
};

function useSystemDark() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

/** Returns the inline style for the block root. "auto" follows the page (.dark / data-theme="dark") or the OS setting. */
export function useAppBlockTheme(theme: AppBlockTheme) {
  const system = useSystemDark();
  const pageDark =
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("dark") ||
      document.documentElement.dataset.theme === "dark");
  const dark = theme === "dark" || (theme === "auto" && (pageDark || system));
  const style = useMemo(
    () => ({ ...(dark ? SEMANTIC_DARK : SEMANTIC_LIGHT), colorScheme: dark ? "dark" : "light" }) as CSSProperties,
    [dark],
  );
  return { style, dark };
}

export function useBlockReducedMotion() {
  return !!useReducedMotion();
}

/** Polite live region for screen-reader announcements. Render `region` once inside the block. */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => {
    setMessage("");
    window.requestAnimationFrame(() => setMessage(text));
  }, []);
  const region = (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
  return { announce, region };
}

type ToastTone = "neutral" | "success" | "error";

/** Minimal toast: one message at a time, auto-dismissed after 3.2 s. Render `node` once inside the block. */
export function useBlockToast() {
  const [toast, setToast] = useState<{ id: number; text: string; tone: ToastTone } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = useCallback((text: string, tone: ToastTone = "neutral") => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text, tone });
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const node = (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-5 z-50 flex justify-center px-4">
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex max-w-[420px] items-center gap-2 rounded-[12px] border border-[color:var(--bjork-border)] bg-[var(--bjork-menu)] px-3.5 py-2.5 text-[12.5px] text-[color:var(--bjork-text-strong)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl"
        >
          {toast.tone !== "neutral" && (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: toast.tone === "success" ? "var(--blk-success)" : "var(--blk-error)" }}
            />
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
  return { show, node };
}

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--blk-accent-fill)] text-[color:var(--blk-accent-fill-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.18)] hover:bg-[var(--bjork-accent-hover)]",
  secondary:
    "border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] hover:bg-[var(--bjork-surface-hover)]",
  ghost: "text-[color:var(--bjork-text)] hover:bg-[var(--bjork-surface-hover)]",
};
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12.5px] rounded-[9px]",
  md: "h-10 px-3.5 text-[13px] rounded-[10px]",
  lg: "h-11 px-4 text-[13.5px] rounded-[11px]",
};

export interface BlockButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const BlockButton = forwardRef<HTMLButtonElement, BlockButtonProps>(function BlockButton(
  { variant = "secondary", size = "md", type = "button", className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex cursor-pointer select-none items-center justify-center gap-2 font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        focusRing,
        className,
      )}
      {...props}
    />
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  pressed?: boolean;
  size?: "sm" | "md";
}

export function IconButton({ label, pressed, size = "md", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "grid cursor-pointer place-items-center rounded-[8px] text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] [&_svg]:size-4",
        size === "sm" ? "size-7" : "size-9",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export interface BlockFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  /** Shown at the end of the label row, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  /** Rendered inside the field after the input, e.g. a show-password button. */
  trailing?: ReactNode;
}

export const BlockField = forwardRef<HTMLInputElement, BlockFieldProps>(function BlockField(
  { label, error, hint, labelAside, trailing, id, className, ...input },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">
          {label}
        </label>
        {labelAside}
      </div>
      <div
        className={cn(
          "flex h-11 items-center gap-1 rounded-[11px] border bg-[var(--bjork-field)] pl-3.5 pr-1.5 shadow-[var(--bjork-shadow-soft)] transition-[border-color,box-shadow] duration-150",
          error
            ? "border-[color:var(--blk-error)] focus-within:ring-[3px] focus-within:ring-[color:color-mix(in_oklab,var(--blk-error)_18%,transparent)]"
            : "border-[color:var(--bjork-border)] hover:border-[color:var(--bjork-border-strong)] focus-within:border-[color:var(--bjork-accent)] focus-within:ring-[3px] focus-within:ring-[color:var(--bjork-accent-soft)]",
        )}
      >
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-[color:var(--bjork-text)] shadow-none outline-none placeholder:text-[color:var(--bjork-text-soft)] read-only:opacity-80"
          {...input}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="text-[12px] text-[color:var(--blk-error)]">
          {error}
        </p>
      ) : hint ? (
        <div id={`${fieldId}-hint`} className="text-[12px] text-[color:var(--bjork-text-soft)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
});

export function InitialsAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full border border-[color:var(--bjork-border)] bg-[var(--bjork-accent-soft)] font-semibold text-[color:var(--blk-accent-ink)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials || "?"}
    </span>
  );
}
