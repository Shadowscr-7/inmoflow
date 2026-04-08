"use client";

import { useAuth } from "@/lib/auth";
import { api, MessageHistoryItem, User } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

export default function MessagesPage() {
  const { token, user } = useAuth();
  const toast = useToast();

  const [messages, setMessages] = useState<MessageHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const limit = 50;

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Users for agent filter
  const [users, setUsers] = useState<User[]>([]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Load users for filter dropdown
  useEffect(() => {
    if (!token) return;
    api.getUsers(token).then(setUsers).catch(() => {});
  }, [token]);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {
        limit: String(limit),
        offset: String(page * limit),
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (directionFilter) params.direction = directionFilter;
      if (statusFilter) params.status = statusFilter;
      if (channelFilter) params.channel = channelFilter;
      if (assigneeFilter) params.assigneeId = assigneeFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const res = await api.getMessageHistory(token, params);
      setMessages(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Error al cargar mensajes");
    }
    setLoading(false);
  }, [token, page, debouncedSearch, directionFilter, statusFilter, channelFilter, assigneeFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const totalPages = Math.ceil(total / limit) || 1;

  const setPresetDays = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().split("T")[0]);
    setDateTo(to.toISOString().split("T")[0]);
    setPage(0);
  };

  const clearFilters = () => {
    setSearch("");
    setDirectionFilter("");
    setStatusFilter("");
    setChannelFilter("");
    setAssigneeFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  const hasFilters = search || directionFilter || statusFilter || channelFilter || assigneeFilter || dateFrom || dateTo;

  const handleRetry = async (msg: MessageHistoryItem) => {
    if (!token || !msg.lead?.id) return;
    setRetryingId(msg.id);
    try {
      await api.retryMessage(token, msg.lead.id, msg.id);
      toast.success("Mensaje reenviado");
      loadMessages();
    } catch {
      toast.error("Error al reintentar el envío");
    } finally {
      setRetryingId(null);
    }
  };

  const statusBadge = (status: string | null) => {
    switch (status) {
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3" /> Enviado
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle className="w-3 h-3" /> Error
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" /> En cola
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {status ?? "—"}
          </span>
        );
    }
  };

  const channelBadge = (channel: string) => {
    const map: Record<string, { bg: string; label: string }> = {
      WHATSAPP: { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "WhatsApp" },
      TELEGRAM: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Telegram" },
      WEB: { bg: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300", label: "Web" },
    };
    const c = map[channel] ?? { bg: "bg-gray-100 text-gray-600", label: channel };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`}>{c.label}</span>;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
      " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  };

  // Guard: only ADMIN / BUSINESS
  if (user && user.role !== "ADMIN" && user.role !== "BUSINESS") {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No tienes permisos para ver esta sección.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
            <MessageSquare className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mensajes</h1>
            <p className="text-sm text-gray-500">Historial de mensajes enviados y recibidos</p>
          </div>
        </div>
        <span className="text-sm text-gray-500">{total.toLocaleString()} mensajes</span>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Filter className="w-4 h-4" /> Filtros
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline ml-2">
              Limpiar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por contenido, teléfono, nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 pl-10 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Direction */}
          <select
            value={directionFilter}
            onChange={(e) => { setDirectionFilter(e.target.value); setPage(0); }}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas las direcciones</option>
            <option value="OUT">Enviados</option>
            <option value="IN">Recibidos</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos los estados</option>
            <option value="sent">Enviado</option>
            <option value="failed">Error</option>
            <option value="queued">En cola</option>
          </select>

          {/* Channel */}
          <select
            value={channelFilter}
            onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos los canales</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="TELEGRAM">Telegram</option>
            <option value="WEB">Web</option>
          </select>

          {/* Assignee */}
          <select
            value={assigneeFilter}
            onChange={(e) => { setAssigneeFilter(e.target.value); setPage(0); }}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos los agentes</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-2 sm:col-span-2">
            <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
            />
            <span className="text-gray-400 text-sm">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
            />
            <div className="flex gap-1 shrink-0">
              {[{ label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }].map((p) => (
                <button
                  key={p.label}
                  onClick={() => setPresetDays(p.days)}
                  className="px-2 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No se encontraron mensajes</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Dir</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Canal</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Lead</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Agente</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 max-w-xs">Contenido</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Error</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    {/* Direction */}
                    <td className="px-4 py-3">
                      {msg.direction === "OUT" ? (
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400" title="Enviado">
                          <ArrowUpRight className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-500" title="Recibido">
                          <ArrowDownLeft className="w-4 h-4" />
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">{statusBadge(msg.status)}</td>

                    {/* Channel */}
                    <td className="px-4 py-3">{channelBadge(msg.channel)}</td>

                    {/* Lead */}
                    <td className="px-4 py-3">
                      {msg.lead ? (
                        <Link
                          href={`/dashboard/leads/${msg.lead.id}`}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          {msg.lead.name ?? msg.lead.phone ?? msg.lead.email ?? "Sin nombre"}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Agent */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {msg.lead?.assignee?.name ?? <span className="text-gray-400">—</span>}
                    </td>

                    {/* Content */}
                    <td className="px-4 py-3 max-w-xs">
                      <span className="block truncate text-gray-700 dark:text-gray-300" title={msg.content}>
                        {msg.content || <span className="text-gray-400 italic">[sin contenido]</span>}
                      </span>
                    </td>

                    {/* Error */}
                    <td className="px-4 py-3 max-w-[200px]">
                      {msg.error ? (
                        <span className="block truncate text-red-600 dark:text-red-400 text-xs" title={msg.error}>
                          {msg.error}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(msg.createdAt)}
                    </td>

                    {/* Retry */}
                    <td className="px-4 py-3">
                      {msg.status === "failed" && msg.direction === "OUT" && msg.lead?.id ? (
                        <button
                          onClick={() => handleRetry(msg)}
                          disabled={retryingId === msg.id}
                          title="Reintentar envío"
                          className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 ${retryingId === msg.id ? "animate-spin" : ""}`} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500">
            <span>
              Mostrando {page * limit + 1}–{Math.min((page + 1) * limit, total)} de {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
