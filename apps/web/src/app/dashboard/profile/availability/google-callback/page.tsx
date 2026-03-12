"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";
import { Check, XCircle } from "lucide-react";

/**
 * Google Calendar OAuth callback page.
 * Google redirects here with ?code=... after the user grants access.
 * We exchange the code via our API and redirect back to availability.
 */
export default function GoogleCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams?.get("code");
    if (!code || !token) {
      setStatus("error");
      setError("No se recibió el código de autorización");
      return;
    }

    api
      .connectGoogleCalendar(token, code)
      .then(() => {
        setStatus("success");
        setTimeout(() => router.push("/dashboard/profile/availability"), 2000);
      })
      .catch((err) => {
        setStatus("error");
        setError((err as Error).message || "Error al conectar");
      });
  }, [searchParams, token, router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-4">
        {status === "loading" && (
          <>
            <Spinner />
            <p className="text-sm text-gray-500">Conectando Google Calendar…</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Google Calendar conectado exitosamente
            </p>
            <p className="text-xs text-gray-500">Redirigiendo…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Error al conectar Google Calendar
            </p>
            <p className="text-xs text-gray-500">{error}</p>
            <button
              onClick={() => router.push("/dashboard/profile/availability")}
              className="btn-primary text-sm mt-2"
            >
              Volver a disponibilidad
            </button>
          </>
        )}
      </div>
    </div>
  );
}
