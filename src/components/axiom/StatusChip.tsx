import { cva } from "class-variance-authority";
import { CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JunctionStatus } from "@/lib/axiom/types";

export type Tone = "clear" | "watch" | "critical" | "neutral";

const chip = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        clear: "border-clear/30 bg-clear-soft text-clear-ink",
        watch: "border-watch/40 bg-watch-soft text-watch-ink",
        critical: "border-critical/30 bg-critical-soft text-critical-ink",
        neutral: "border-border bg-muted text-muted-foreground",
      },
      size: {
        sm: "h-6 px-2 text-xs [&_svg]:size-3.5",
        md: "h-8 px-3 text-sm [&_svg]:size-4",
        lg: "h-10 px-4 text-base [&_svg]:size-5",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export const STATUS_META: Record<JunctionStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  CLEAR: { label: "Clear", tone: "clear", icon: CircleCheck },
  WATCH: { label: "Watch", tone: "watch", icon: TriangleAlert },
  CRITICAL: { label: "Critical", tone: "critical", icon: OctagonAlert },
};

export function Chip({
  tone,
  icon: Icon,
  children,
  size,
  className,
}: {
  tone: Tone;
  icon?: LucideIcon | undefined;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
}) {
  return (
    <span className={cn(chip({ tone, size }), className)}>
      {Icon && <Icon aria-hidden />}
      {children}
    </span>
  );
}

export function StatusChip({
  status,
  size,
  className,
}: {
  status: JunctionStatus;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
}) {
  const meta = STATUS_META[status];
  return (
    <Chip tone={meta.tone} icon={meta.icon} size={size} className={className}>
      {meta.label}
    </Chip>
  );
}
