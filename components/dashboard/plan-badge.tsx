import { Badge } from "@/components/ui/badge";
import type { Plan } from "@/lib/supabase/types";

export function PlanBadge({ plan }: { plan: Plan }) {
  const map: Record<Plan, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
    starter: { label: "Starter", variant: "default" },
    growth: { label: "Growth", variant: "success" },
    enterprise: { label: "Enterprise", variant: "secondary" },
    trial: { label: "Trial", variant: "warning" },
    suspended: { label: "Suspended", variant: "destructive" },
  };
  const m = map[plan];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant: "default" | "success" | "warning" | "destructive" | "secondary" =
    status === "succeeded" ? "success"
    : status === "failed" ? "destructive"
    : status === "pending" ? "warning"
    : status === "running" ? "default"
    : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

export function SeverityBadge({ severity }: { severity: "info" | "warning" | "critical" }) {
  const variant: "secondary" | "warning" | "destructive" =
    severity === "critical" ? "destructive" : severity === "warning" ? "warning" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}
