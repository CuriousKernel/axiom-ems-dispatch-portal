import { CloudOff, Database, Wifi } from "lucide-react";
import { useAxiom } from "@/lib/axiom/store";
import type { ConnectionState } from "@/lib/axiom/types";
import { Chip } from "./StatusChip";

export function ConnectionChip({ state }: { state?: ConnectionState }) {
  const axiomConn = useAxiom((s) => s.connection);
  const connection = state ?? axiomConn;

  if (connection === "reconnecting")
    return (
      <Chip tone="watch" icon={CloudOff}>
        <span className="pulse-dot">Reconnecting</span>
      </Chip>
    );
  if (connection === "live")
    return (
      <Chip tone="clear" icon={Wifi}>
        Live
      </Chip>
    );
  return (
    <Chip tone="neutral" icon={Database}>
      Mock data
    </Chip>
  );
}
