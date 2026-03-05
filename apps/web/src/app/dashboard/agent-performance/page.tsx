"use client";

import { useAuth } from "@/lib/auth";
import { api, AgentMetrics, Leaderboard } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Trophy,
  TrendingUp,
  Users,
  Target,
  MessageSquare,
  CalendarCheck,
  Award,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

function GoalBar({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-0.5">
        <span>{label}</span>
        <span className="font-medium">{actual}/{target} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TemperatureBadge({ rate }: { rate: number }) {
  if (rate >= 50) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">🔥 Excelente</span>;
  if (rate >= 25) return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">👍 Bueno</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">📊 En progreso</span>;
}

export default function AgentPerformancePage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [team, setTeam] = useState<AgentMetrics[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [view, setView] = useState<"team" | "leaderboard">("team");

  // Goal modal
  const [goalModal, setGoalModal] = useState<AgentMetrics | null>(null);
  const [goalForm, setGoalForm] = useState({ leadsTarget: 0, visitsTarget: 0, wonTarget: 0 });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [t, lb] = await Promise.all([
        api.getTeamPerformance(token, month),
        api.getLeaderboard(token, month),
      ]);
      setTeam(t);
      setLeaderboard(lb);
    } catch {
      toast.error("Error al cargar rendimiento");
    }
    setLoading(false);
  }, [token, month]);

  useEffect(() => { load(); }, [load]);

  const handleSetGoal = async () => {
    if (!token || !goalModal) return;
    try {
      await api.setAgentGoal(token, goalModal.userId, { month, ...goalForm });
      toast.success("Meta guardada");
      setGoalModal(null);
      load();
    } catch {
      toast.error("Error al guardar meta");
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(`${month}-01`);
    d.setMonth(d.getMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" /> Rendimiento del equipo
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Métricas de productividad y ranking de agentes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[80px] text-center">{monthLabel(month)}</span>
          <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("team")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "team" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        >
          <Users className="inline h-4 w-4 mr-1" /> Equipo
        </button>
        <button
          onClick={() => setView("leaderboard")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "leaderboard" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        >
          <Award className="inline h-4 w-4 mr-1" /> Ranking
        </button>
      </div>

      {/* Team view */}
      {view === "team" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {team.map((agent, i) => (
            <div key={agent.userId} className="bg-white dark:bg-gray-900 rounded-xl border p-5 shadow-sm">
              {/* Agent header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {(agent.name ?? agent.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{agent.name ?? agent.email}</div>
                    <div className="text-xs text-gray-500">{agent.role === "BUSINESS" ? "Director" : "Agente"}</div>
                  </div>
                </div>
                {i === 0 && team.length > 1 && <span title="Mejor del mes" className="text-2xl">🏆</span>}
                {i === 1 && team.length > 2 && <span title="Segundo lugar" className="text-xl">🥈</span>}
                {i === 2 && team.length > 3 && <span title="Tercer lugar" className="text-xl">🥉</span>}
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-lg font-bold text-blue-600">{agent.newLeads}</div>
                  <div className="text-[10px] text-gray-500">Leads nuevos</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-lg font-bold text-green-600">{agent.wonLeads}</div>
                  <div className="text-[10px] text-gray-500">Ganados</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-lg font-bold text-purple-600">{agent.conversionRate}%</div>
                  <div className="text-[10px] text-gray-500">Conversión</div>
                </div>
              </div>

              {/* Activity */}
              <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{agent.messagesSent} enviados</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  <span>{agent.completedVisits} visitas</span>
                </div>
              </div>

              <TemperatureBadge rate={agent.conversionRate} />

              {/* Goals */}
              {agent.goals ? (
                <div className="mt-4 pt-3 border-t">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                    <Target className="h-3 w-3" /> Metas del mes
                  </h4>
                  <GoalBar label="Leads" actual={agent.goals.leadsActual} target={agent.goals.leadsTarget} />
                  <GoalBar label="Visitas" actual={agent.goals.visitsActual} target={agent.goals.visitsTarget} />
                  <GoalBar label="Ganados" actual={agent.goals.wonActual} target={agent.goals.wonTarget} />
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t">
                  {(user?.role === "ADMIN" || user?.role === "BUSINESS") && (
                    <button
                      onClick={() => { setGoalModal(agent); setGoalForm({ leadsTarget: 10, visitsTarget: 5, wonTarget: 2 }); }}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Target className="h-3 w-3" /> Establecer metas
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {team.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hay agentes para mostrar</p>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard view */}
      {view === "leaderboard" && leaderboard && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* By Won */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-5 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Trophy className="h-4 w-4 text-amber-500" /> Más cierres
            </h3>
            <div className="space-y-2">
              {leaderboard.byWon.map((a, i) => (
                <div key={a.userId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                    <span className="text-sm">{a.name ?? a.email}</span>
                  </div>
                  <span className="font-bold text-green-600">{a.wonLeads}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Conversion */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-5 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-blue-500" /> Mejor conversión
            </h3>
            <div className="space-y-2">
              {leaderboard.byConversion.map((a, i) => (
                <div key={a.userId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                    <span className="text-sm">{a.name ?? a.email}</span>
                  </div>
                  <span className="font-bold text-blue-600">{a.conversionRate}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Visits */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-5 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <CalendarCheck className="h-4 w-4 text-purple-500" /> Más visitas completadas
            </h3>
            <div className="space-y-2">
              {leaderboard.byVisits.map((a, i) => (
                <div key={a.userId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                    <span className="text-sm">{a.name ?? a.email}</span>
                  </div>
                  <span className="font-bold text-purple-600">{a.completedVisits}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Messages */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-5 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-emerald-500" /> Más mensajes enviados
            </h3>
            <div className="space-y-2">
              {leaderboard.byMessages.map((a, i) => (
                <div key={a.userId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                    <span className="text-sm">{a.name ?? a.email}</span>
                  </div>
                  <span className="font-bold text-emerald-600">{a.messagesSent}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Goal Modal */}
      {goalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-lg mb-4">
              Metas para {goalModal.name ?? goalModal.email} — {monthLabel(month)}
            </h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-gray-600 dark:text-gray-300">Leads objetivo</span>
                <input
                  type="number" min={0}
                  value={goalForm.leadsTarget}
                  onChange={(e) => setGoalForm((p) => ({ ...p, leadsTarget: +e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-800"
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600 dark:text-gray-300">Visitas objetivo</span>
                <input
                  type="number" min={0}
                  value={goalForm.visitsTarget}
                  onChange={(e) => setGoalForm((p) => ({ ...p, visitsTarget: +e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-800"
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600 dark:text-gray-300">Cierres objetivo</span>
                <input
                  type="number" min={0}
                  value={goalForm.wonTarget}
                  onChange={(e) => setGoalForm((p) => ({ ...p, wonTarget: +e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-800"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setGoalModal(null)} className="flex-1 px-4 py-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
              <button onClick={handleSetGoal} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
