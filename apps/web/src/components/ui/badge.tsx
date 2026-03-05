import { type ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "purple" | "indigo" | "orange";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  purple: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ variant = "default", children, className = "", dot }: BadgeProps) {
  return (
    <span className={`badge ${variantClasses[variant]} ${className}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          variant === "success" ? "bg-emerald-500" :
          variant === "warning" ? "bg-amber-500" :
          variant === "danger" ? "bg-red-500" :
          variant === "info" ? "bg-blue-500" : "bg-gray-500"
        }`} />
      )}
      {children}
    </span>
  );
}

// Status-specific mappings for leads
const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  NEW: { label: "Nuevo", variant: "info" },
  CONTACTED: { label: "Contactado", variant: "warning" },
  QUALIFIED: { label: "Calificado", variant: "purple" },
  VISIT: { label: "Visita", variant: "indigo" },
  NEGOTIATION: { label: "Negociación", variant: "orange" },
  WON: { label: "Ganado", variant: "success" },
  LOST: { label: "Perdido", variant: "danger" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] ?? { label: status, variant: "default" as BadgeVariant };
  return <Badge variant={config.variant} dot>{config.label}</Badge>;
}

// Channel badges
const CHANNEL_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  WHATSAPP: { label: "WhatsApp", variant: "success" },
  TELEGRAM: { label: "Telegram", variant: "info" },
  META: { label: "Meta", variant: "indigo" },
  WEB: { label: "Web", variant: "default" },
};

export function ChannelBadge({ channel }: { channel: string }) {
  const config = CHANNEL_MAP[channel] ?? { label: channel, variant: "default" as BadgeVariant };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// Connection status
const CONN_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  CONNECTED: { label: "Conectado", variant: "success" },
  CONNECTING: { label: "Conectando", variant: "warning" },
  DISCONNECTED: { label: "Desconectado", variant: "default" },
  ERROR: { label: "Error", variant: "danger" },
};

export function ConnectionBadge({ status }: { status: string }) {
  const config = CONN_MAP[status] ?? { label: status, variant: "default" as BadgeVariant };
  return <Badge variant={config.variant} dot>{config.label}</Badge>;
}
