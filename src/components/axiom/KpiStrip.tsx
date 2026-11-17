import { Ambulance, BellRing, Clock, Info, OctagonAlert, Timer, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MOCK_ALERTS, MOCK_OFFICER_HISTORY, MOCK_READINGS } from "@/lib/axiom/seed";
import { cn } from "@/lib/utils";

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
  emphasis,
  info,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string | undefined;
  emphasis?: "critical" | "watch" | undefined;
  info?: React.ReactNode | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon
          className={cn(
            "size-3.5",
            emphasis === "critical" && "text-critical",
            emphasis === "watch" && "text-watch-ink",
          )}
          aria-hidden
        />
        <span className="truncate">{label}</span>
        {info && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="ml-auto rounded text-muted-foreground hover:text-foreground" aria-label={`How ${label} is calculated`}>
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">{info}</TooltipContent>
          </Tooltip>
        )}
      </span>
      <span className="tnum text-display font-semibold">{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function KpiStrip() {
  const critical = MOCK_READINGS.filter((r) => r.status === "CRITICAL").length;
  const awaiting = MOCK_ALERTS.filter((a) => a.state === "SENT" || a.state === "CREATED").length;
  const avg = Math.round(
    MOCK_OFFICER_HISTORY.reduce((a, b) => a + b.responseSeconds, 0) / MOCK_OFFICER_HISTORY.length,
  );

  return (
    <div className="grid grid-cols-5 gap-3">
      <Kpi label="Active ambulances" value="1" icon={Ambulance} hint="P1 cardiac" />
      <Kpi
        label="Critical junctions"
        value={String(critical)}
        icon={OctagonAlert}
        emphasis={critical ? "critical" : undefined}
        hint={critical ? "Needs officer action" : "None"}
      />
      <Kpi
        label="Awaiting acknowledgement"
        value={String(awaiting)}
        icon={BellRing}
        emphasis={awaiting ? "watch" : undefined}
        hint="Escalates after 30 s"
      />
      <Kpi label="Avg officer response" value={`${avg} s`} icon={Timer} hint="Sample data" />
      <Kpi
        label="Est. minutes saved"
        value="--"
        icon={Clock}
        hint="Shown when the trip ends"
        info={
          <>
            Minutes saved = unmanaged travel time (adding each critical junction's full clear time as
            delay) minus managed travel time.
          </>
        }
      />
    </div>
  );
}
