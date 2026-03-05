"use client";

import { useAuth } from "@/lib/auth";
import { api, SummaryReport } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import { BarChart3, Download, Calendar, TrendingUp, Users, Building2, CalendarCheck } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ReportsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [report, setReport] = useState<SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.getSummaryReport(token, params);
      setReport(res);
    } catch { /* */ }
    setLoading(false);
  }, [token, from, to]);

  useEffect(() => { load(); }, [load]);

  const downloadCSV = (type: "leads" | "properties") => {
    if (!token) return;
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const qs = Object.keys(params).length > 0 ? "?" + new URLSearchParams(params).toString() : "";
    // Open in new window with auth header via form trick
    const url = `${API_URL}/api/reports/${type}/csv${qs}`;
    // We use fetch + blob for Auth header
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${type}-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        toast.success("Descarga iniciada");
      })
      .catch(() => toast.error("Error al descargar"));
  };

  const setPreset = (days: number) => {
    const now = new Date();
    const past = new Date(now);
    past.setDate(past.getDate() - days);
    setFrom(past.toISOString().split("T")[0]);
    setTo(now.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-indigo-500" /> Reportes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resumen de actividad y exportación de datos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadCSV("leads")} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Download className="h-4 w-4" /> Exportar Leads CSV
          </button>
          <button onClick={() => downloadCSV("properties")} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Download className="h-4 w-4" /> Exportar Propiedades CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
          <span className="text-gray-400">—</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </div>
        <div className="flex gap-1">
          {[{ label: "7 días", days: 7 }, { label: "30 días", days: 30 }, { label: "90 días", days: 90 }, { label: "Todo", days: 0 }].map((p) => (
            <button key={p.label} onClick={() => p.days ? setPreset(p.days) : (setFrom(""), setTo(""))}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-300">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : report ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg"><Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.leads.total}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Leads</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg"><TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.leads.byStatus["WON"] ?? 0}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Leads Ganados</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg"><Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.properties.total}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Propiedades</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg"><CalendarCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.visits.total}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Visitas</p>
                </div>
              </div>
            </div>
          </div>

          {/* Detail sections */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Leads by status */}
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Leads por Estado</h3>
              <div className="space-y-2">
                {Object.entries(report.leads.byStatus).map(([status, count]) => {
                  const pct = report.leads.total > 0 ? (count / report.leads.total) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-28">{status}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white w-10 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leads by stage */}
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Leads por Etapa</h3>
              <div className="space-y-2">
                {Object.entries(report.leads.byStage).map(([stage, count]) => {
                  const pct = report.leads.total > 0 ? (count / report.leads.total) * 100 : 0;
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-28 truncate">{stage}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white w-10 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leads by source */}
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Leads por Fuente</h3>
              <div className="space-y-2">
                {Object.entries(report.leads.bySource).map(([source, count]) => {
                  const pct = report.leads.total > 0 ? (count / report.leads.total) * 100 : 0;
                  return (
                    <div key={source} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-28 truncate">{source}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white w-10 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Visits by status */}
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Visitas por Estado</h3>
              <div className="space-y-2">
                {Object.entries(report.visits.byStatus).map(([status, count]) => {
                  const pct = report.visits.total > 0 ? (count / report.visits.total) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-28">{status}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white w-10 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
