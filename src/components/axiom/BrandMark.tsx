import { cn } from "@/lib/utils";

export function BrandMark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img src="/icons/icon-192.png" alt="" width={28} height={28} className="size-7 rounded-md" />
      {!compact && <span className="text-base font-semibold tracking-tight">Axiom-EMS</span>}
    </span>
  );
}
