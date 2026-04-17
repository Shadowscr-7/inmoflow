"use client";

import { useAuth } from "@/lib/auth";
import { api, LeadRecoveryItem } from "@/lib/api";
import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, Search, Users, AlertTriangle, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";

type ItemStatus = "PENDING" | "APPROVED" | "REJECTED";

const STATUS_BADGE: Record<ItemStatus, { label: string; className: string }> = {
  PENDING:  { label: "Pendiente", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  APPROVED: { label: "Aprobado",  className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  REJECTED: { label: "Rechazado", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function LeadRecoveryPage() {
  const { token } = useAuth();
  const toast = useToast();

  const [from, setFrom] = useState(sevenDaysAgo());
  const [to, setTo]     = useState(today());
  const [items, setItems]       = useState<LeadRecoveryItem[]>([]);
  const [totalSources, setTotalSources] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [fetched, setFetched]   = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const handleFetch = async () => {
    if (!token) return;
    setLoading(true);
    setFetched(false);
    try {
      const res = await api.fetchLeadRecovery(token, `${from}T00:00:00Z`, `${to}T23:59:59Z`);
      setItems(res.items);
      setTotalSources(res.sources);
      setFetched(true);
      if (res.total === 0) {
        toast.info("No se encontraron leads de Meta en las fechas seleccionadas.");
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (item: LeadRecoveryItem) => {
    if (!token) return;
    setActionLoading((p) => ({ ...p, [item.leadgenId]: true }));
    try {
      await api.approveLeadRecovery(token, item.leadgenId);
      setItems((prev) =>
        prev.map((i) => i.leadgenId === item.leadgenId ? { ...i, status: "APPROVED" } : i)
      );
      toast.success(`${item.name ?? "Lead"} fue creado en el CRM.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActionLoading((p) => ({ ...p, [item.leadgenId]: false }));
    }
  };

  const handleReject = async (item: LeadRecoveryItem) => {
    if (!token) return;
    setActionLoading((p) => ({ ...p, [item.leadgenId]: true }));
    try {
      await api.rejectLeadRecovery(token, item.leadgenId);
      setItems((prev) =>
        prev.map((i) => i.leadgenId === item.leadgenId ? { ...i, status: "REJECTED" } : i)
      );
      toast.success("Lead rechazado y registrado como descartado.");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActionLoading((p) => ({ ...p, [item.leadgenId]: false }));
    }
  };

  const pending  = items.filter((i) => i.status === "PENDING").length;
  const approved = items.filter((i) => i.status === "APPROVED").length;
  const rejected = items.filter((i) => i.status === "REJECTED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recuperación de Leads</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Consultá leads de Meta en un rango de fechas y aprobá o rechazá cada uno antes de que entren al CRM.
        </p>
      </div>

      {/* Filter panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Desde</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Hasta</label>
            <input
              type="date"
              value={to}
              min={from}
              max={today()}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={handleFetch}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? <Spinner size="sm" /> : <Search className="w-4 h-4" />}
            Recuperar leads
          </button>
        </div>
      </div>

      {/* Stats */}
      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total encontrados", value: items.length, color: "text-gray-700 dark:text-gray-200" },
            { label: "Pendientes",        value: pending,      color: "text-yellow-600 dark:text-yellow-400" },
            { label: "Aprobados",         value: approved,     color: "text-green-600 dark:text-green-400" },
            { label: "Rechazados",        value: rejected,     color: "text-red-600 dark:text-red-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {fetched && items.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Contacto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Formulario</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Respuestas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((item) => {
                  const busy = actionLoading[item.leadgenId];
                  const badge = STATUS_BADGE[item.status];
                  const customEntries = Object.entries(item.customFields);
                  return (
                    <tr
                      key={item.leadgenId}
                      className={`transition-colors ${
                        item.status === "APPROVED" ? "bg-green-50/30 dark:bg-green-900/10" :
                        item.status === "REJECTED" ? "bg-red-50/30 dark:bg-red-900/10 opacity-60" :
                        "hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      }`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xs font-bold text-brand-600 dark:text-brand-400 shrink-0">
                            {(item.name ?? "?")[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{item.name ?? "—"}</p>
                            {item.leadId && (
                              <a
                                href={`/dashboard/leads/${item.leadId}`}
                                className="text-xs text-brand-600 hover:underline flex items-center gap-1"
                              >
                                Ver lead <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {item.phone && <p className="text-gray-700 dark:text-gray-300">{item.phone}</p>}
                          {item.email && <p className="text-gray-500 dark:text-gray-400 text-xs">{item.email}</p>}
                          {!item.phone && !item.email && <span className="text-gray-400">—</span>}
                        </div>
                      </td>

                      {/* Form */}
                      <td className="px-4 py-3">
                        <p className="text-gray-700 dark:text-gray-300 font-medium">{item.formName ?? item.formId}</p>
                        {item.campaignName && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.campaignName}</p>
                        )}
                      </td>

                      {/* Custom fields */}
                      <td className="px-4 py-3">
                        {customEntries.length > 0 ? (
                          <div className="space-y-0.5 max-w-[200px]">
                            {customEntries.slice(0, 3).map(([k, v]) => (
                              <p key={k} className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                <span className="font-medium">{k.replace(/_/g, " ")}:</span> {v}
                              </p>
                            ))}
                            {customEntries.length > 3 && (
                              <p className="text-xs text-gray-400">+{customEntries.length - 3} más</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                        {new Date(item.createdTime).toLocaleString("es-UY", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {item.status === "PENDING" && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprove(item)}
                              disabled={busy}
                              title="Aprobar — crea el lead en el CRM"
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                            >
                              {busy ? <Spinner size="sm" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Aprobar
                            </button>
                            <button
                              onClick={() => handleReject(item)}
                              disabled={busy}
                              title="Rechazar — descarta el lead"
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                            >
                              {busy ? <Spinner size="sm" /> : <XCircle className="w-3.5 h-3.5" />}
                              Rechazar
                            </button>
                          </div>
                        )}
                        {item.status === "APPROVED" && (
                          <div className="flex justify-end">
                            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                              <CheckCircle2 className="w-4 h-4" /> Aprobado
                            </span>
                          </div>
                        )}
                        {item.status === "REJECTED" && (
                          <div className="flex justify-end">
                            <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 font-medium">
                              <XCircle className="w-4 h-4" /> Rechazado
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {fetched && items.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Users className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Sin leads en ese rango</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            No se encontraron leads de Meta entre {from} y {to} ({totalSources} fuente{totalSources !== 1 ? "s" : ""} consultada{totalSources !== 1 ? "s" : ""}).
          </p>
        </div>
      )}

      {/* Initial state */}
      {!fetched && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <RotateCcw className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Seleccioná un rango de fechas</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Elegí el período y presioná <strong>Recuperar leads</strong> para consultar Meta.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2 rounded-lg max-w-sm mx-auto">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Requiere fuentes de tipo Meta Lead Ad con token configurado.
          </div>
        </div>
      )}
    </div>
  );
}
