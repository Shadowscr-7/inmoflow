import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-950">
      <div className="text-center max-w-md mx-auto p-8">
        <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-700 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Página no encontrada
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
          La página que buscás no existe o fue movida.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  );
}
