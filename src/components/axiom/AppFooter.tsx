import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "flex items-center justify-center gap-1.5 px-4 py-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      Prototype: advisory alerts, officer-approved.
    </footer>
  );
}
