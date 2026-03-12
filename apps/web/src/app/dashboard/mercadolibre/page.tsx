"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api, type MeliStatus, type MeliItemPreview, type MeliSyncResult } from "@/lib/api";
import {
  Store,
  Link2,
  Unlink,
  RefreshCcw,
  ExternalLink,
  Image as ImageIcon,
  Video,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
} from "lucide-react";
import { PageHeader, PageLoader, useToast, useConfirm, Badge } from "@/components/ui";

export default function MercadoLibrePage() {
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<MeliStatus | null>(null);
  const [items, setItems] = useState<MeliItemPreview[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<MeliSyncResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Load status ─────────────────────────────
  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [cfg, st] = await Promise.all([
        api.getMeliConfigured(token),
        api.getMeliStatus(token),
      ]);
      setConfigured(cfg.configured);
      setStatus(st);
    } catch {
      toast.error("Error al consultar estado de MercadoLibre");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ─── Handle OAuth callback (if code in URL) ──
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      // Remove code from URL
      window.history.replaceState({}, "", window.location.pathname);
      handleCallback(code);
    }
  }, [token]);

  const handleCallback = async (code: string) => {
    if (!token) return;
    try {
      setLoading(true);
      await api.handleMeliCallback(token, code);
      toast.success("MercadoLibre conectado exitosamente");
      await loadStatus();
    } catch {
      toast.error("Error al conectar MercadoLibre");
    } finally {
      setLoading(false);
    }
  };

  // ─── Connect ─────────────────────────────────
  const handleConnect = async () => {
    if (!token) return;
    try {
      const { url } = await api.getMeliAuthUrl(token);
      window.location.href = url;
    } catch {
      toast.error("Error al obtener URL de autorización");
    }
  };

  // ─── Disconnect ──────────────────────────────
  const handleDisconnect = async () => {
    if (!token) return;
    const ok = await confirm({
      title: "Desconectar MercadoLibre",
      message: "¿Estás seguro? Las propiedades importadas se mantendrán pero no se sincronizarán más.",
      confirmLabel: "Desconectar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.disconnectMeli(token);
      setStatus({ connected: false, userId: null, lastSync: null });
      setItems([]);
      toast.success("MercadoLibre desconectado");
    } catch {
      toast.error("Error al desconectar");
    }
  };

  // ─── Load Items Preview ──────────────────────
  const loadItems = async () => {
    if (!token) return;
    try {
      setLoadingItems(true);
      const data = await api.getMeliItems(token);
      setItems(data.items);
    } catch {
      toast.error("Error al cargar publicaciones de MercadoLibre");
    } finally {
      setLoadingItems(false);
    }
  };

  // ─── Sync ────────────────────────────────────
  const handleSync = async () => {
    if (!token) return;
    try {
      setSyncing(true);
      setSyncResult(null);
      const result = await api.syncMeli(token);
      setSyncResult(result);
      toast.success(`Sincronización completa: ${result.created} creadas, ${result.updated} actualizadas`);
      await loadStatus();
    } catch {
      toast.error("Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  // ─── Filter items ────────────────────────────
  const filteredItems = items.filter((i) =>
    !searchQuery || i.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="MercadoLibre"
        description="Conectá tu cuenta de MercadoLibre para importar propiedades"
      />

      {/* ─── Not Configured ──────────────────── */}
      {!configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                Integración no configurada
              </h3>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                El servidor no tiene las credenciales de MercadoLibre configuradas.
                Contactá al administrador para configurar <code>MELI_CLIENT_ID</code>,{" "}
                <code>MELI_CLIENT_SECRET</code> y <code>MELI_REDIRECT_URI</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Connection Card ────────────────── */}
      {configured && (
        <div className="rounded-lg border bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`rounded-full p-3 ${
                status?.connected
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-gray-100 dark:bg-gray-700"
              }`}>
                <Store className={`h-6 w-6 ${
                  status?.connected
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-400"
                }`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {status?.connected ? "Cuenta conectada" : "Cuenta no conectada"}
                </h3>
                {status?.connected && (
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                    <span>Usuario: <strong>{status.userId}</strong></span>
                    {status.lastSync && (
                      <span>
                        Última sincronización:{" "}
                        {new Date(status.lastSync).toLocaleString("es")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {status?.connected ? (
                <>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                    {syncing ? "Sincronizando..." : "Sincronizar"}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Unlink className="h-4 w-4" />
                    Desconectar
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-2 rounded-lg bg-yellow-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-yellow-600"
                >
                  <Link2 className="h-4 w-4" />
                  Conectar MercadoLibre
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Sync Result ────────────────────── */}
      {syncResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h4 className="font-semibold text-green-800 dark:text-green-200">
              Sincronización completada
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{syncResult.total}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{syncResult.created}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Creadas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{syncResult.updated}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Actualizadas</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${syncResult.errors > 0 ? "text-red-600" : "text-gray-400"}`}>
                {syncResult.errors}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Errores</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Items Preview ──────────────────── */}
      {status?.connected && (
        <div className="rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b p-4 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Publicaciones en MercadoLibre
            </h3>
            <button
              onClick={loadItems}
              disabled={loadingItems}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              {loadingItems ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {items.length > 0 ? "Actualizar" : "Ver publicaciones"}
            </button>
          </div>

          {items.length > 0 && (
            <>
              {/* Search */}
              <div className="border-b p-3 dark:border-gray-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar publicaciones..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border bg-white py-2 pl-10 pr-4 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Items list */}
              <div className="divide-y dark:divide-gray-700">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    {/* Thumbnail */}
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900 dark:text-white">
                        {item.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        {item.price != null && (
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {item.currency ?? "USD"} {item.price?.toLocaleString("es")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <ImageIcon className="h-3.5 w-3.5" />
                          {item.pictureCount}
                        </span>
                        {item.hasVideo && (
                          <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                            <Video className="h-3.5 w-3.5" />
                            Video
                          </span>
                        )}
                        <Badge
                          variant={item.status === "active" ? "success" : "default"}
                        >
                          {item.status ?? "?"}
                        </Badge>
                      </div>
                    </div>

                    {/* Link */}
                    {item.permalink && (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-brand-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {filteredItems.length === 0 && searchQuery && (
                <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No se encontraron publicaciones con &quot;{searchQuery}&quot;
                </div>
              )}
            </>
          )}

          {items.length === 0 && !loadingItems && (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Hacé clic en &quot;Ver publicaciones&quot; para previsualizar tus publicaciones de MercadoLibre antes de importarlas.
            </div>
          )}

          {loadingItems && items.length === 0 && (
            <div className="flex items-center justify-center gap-2 p-8">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              <span className="text-sm text-gray-500">Cargando publicaciones...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
