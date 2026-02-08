"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export default function Switch({
  checked,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={(next) => onChange(Boolean(next))}
      disabled={disabled}
      aria-label={ariaLabel ?? "Toggle"}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`.trim()}
    >
      <SwitchPrimitive.Thumb
        className="absolute left-0.5 top-0.5 block h-5 w-5 rounded-full border border-border shadow-sm bg-surface translate-x-0 data-[state=checked]:translate-x-5 data-[state=checked]:bg-foreground transition-none"
      />
    </SwitchPrimitive.Root>
  );
}
