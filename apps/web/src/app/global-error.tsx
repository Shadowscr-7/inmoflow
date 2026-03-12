"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <html>
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md mx-auto p-8">
            <h2 className="text-xl font-semibold mb-2">Error inesperado</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
              La aplicación encontró un error. Intentá recargar.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
