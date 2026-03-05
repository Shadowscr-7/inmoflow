import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <Loader2 className={`animate-spin text-brand-600 ${sizes[size]} ${className}`} />
  );
}

export function PageLoader({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}
