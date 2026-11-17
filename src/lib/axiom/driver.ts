import { CircleCheck, OctagonAlert, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react";
import type { AlertRecord } from "./types";
import type { Tone } from "@/components/axiom/StatusChip";

export interface DriverChip {
  label: "Clear" | "Alert sent" | "Officer in position" | "Cleared";
  tone: Tone;
  icon: LucideIcon;
}

/** What the driver sees for a junction, derived from its alert (if any). */
export function driverChipFor(alert: AlertRecord | undefined): DriverChip {
  if (!alert) return { label: "Clear", tone: "clear", icon: CircleCheck };
  switch (alert.state) {
    case "VERIFIED_CLEAR":
      return { label: "Cleared", tone: "clear", icon: ShieldCheck };
    case "IN_POSITION":
    case "CLEARING":
      return { label: "Officer in position", tone: "watch", icon: UserCheck };
    default:
      return { label: "Alert sent", tone: "critical", icon: OctagonAlert };
  }
}
