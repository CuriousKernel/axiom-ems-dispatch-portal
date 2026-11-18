import { CloudOff, Database, Laptop, Wifi } from "lucide-react";
import { useAxiom } from "@/lib/axiom/store";
import type { ConnectionState } from "@/lib/axiom/types";
import { Chip } from "./StatusChip";

export function ConnectionChip({
  state,
  stale,
}: {
  state?: ConnectionState;
  stale?: boolean;
}) {
  const axiomConn = useAxiom((s) => s.connection);
  const connection = state ?? axiomConn;

  if (stale || connection === "reconnecting") {
    return (
      <Chip tone="watch" icon={CloudOff} className="max-w-[280px] text-xs">
        <span className="pulse-dot truncate">
          Control Room not sending. Keep the Control Room window visible, or open /demo
        </span>
      </Chip>
    );
  }
  if (connection === "connecting")
    return (
      <Chip tone="watch" icon={CloudOff}>
        <span className="pulse-dot">Connecting</span>
      </Chip>
    );
  if (connection === "live")
    return (
      <Chip tone="clear" icon={Wifi}>
        Live
      </Chip>
    );
  if (connection === "local")
    return (
      <Chip tone="neutral" icon={Laptop}>
        Local mode
      </Chip>
    );
  return (
    <Chip tone="neutral" icon={Database}>
      Mock data
    </Chip>
  );
}
