import { CloudOff, Database, Laptop, Wifi } from "lucide-react";
import { useAxiom } from "@/lib/axiom/store";
import type { ConnectionState } from "@/lib/axiom/types";
import { Chip } from "./StatusChip";

export function ConnectionChip({ state }: { state?: ConnectionState }) {
  const axiomConn = useAxiom((s) => s.connection);
  const connection = state ?? axiomConn;

  if (connection === "reconnecting" || connection === "connecting")
    return (
      <Chip tone="watch" icon={CloudOff}>
        <span className="pulse-dot">{connection === "connecting" ? "Connecting" : "Reconnecting"}</span>
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
