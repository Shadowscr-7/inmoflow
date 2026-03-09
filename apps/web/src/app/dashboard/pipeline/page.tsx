"use client";

import { useAuth } from "@/lib/auth";
import { api, type PipelineStage, type Lead } from "@/lib/api";
import { useEffect, useState, useCallback, useRef, type DragEvent } from "react";
import Link from "next/link";
import { Kanban, GripVertical, Phone, Mail } from "lucide-react";
import { StatusBadge, PageHeader, PageLoader, EmptyState, useToast } from "@/components/ui";

const STAGE_COLORS: Record<number, string> = {
  0: "from-blue-500",
  1: "from-amber-500",
  2: "from-purple-500",
  3: "from-indigo-500",
  4: "from-orange-500",
  5: "from-emerald-500",
  6: "from-red-500",
};

export default function PipelinePage() {
  const { token } = useAuth();
  const toast = useToast();
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);

  // DnD state
  const dragLeadRef = useRef<{ leadId: string; fromStageId: string } | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);

  const loadPipeline = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getPipeline(token);
      setPipeline(data);
    } catch { toast.error("Error al cargar pipeline"); }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  // ─── Drag handlers ─────────────────────────────────
  const onDragStart = (e: DragEvent, lead: Lead, stageId: string) => {
    dragLeadRef.current = { leadId: lead.id, fromStageId: stageId };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id);
    // Slight delay so the browser captures the drag image first
    requestAnimationFrame(() => setMovingLeadId(lead.id));
  };

  const onDragEnd = () => {
    dragLeadRef.current = null;
    setDragOverStageId(null);
    setMovingLeadId(null);
  };

  const onDragOver = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStageId !== stageId) setDragOverStageId(stageId);
  };

  const onDragLeave = (e: DragEvent, stageId: string) => {
    // Only clear if we truly left the column (not entering a child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      if (dragOverStageId === stageId) setDragOverStageId(null);
    }
  };

  const onDrop = async (e: DragEvent, targetStageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);
    const drag = dragLeadRef.current;
    if (!drag || !token) return;
    if (drag.fromStageId === targetStageId) { onDragEnd(); return; }

    // Optimistic update
    setPipeline((prev) => {
      const next = prev.map((s) => ({ ...s, leads: [...(s.leads ?? [])] }));
      const srcStage = next.find((s) => s.id === drag.fromStageId);
      const dstStage = next.find((s) => s.id === targetStageId);
      if (!srcStage || !dstStage) return prev;
      const idx = srcStage.leads.findIndex((l) => l.id === drag.leadId);
      if (idx === -1) return prev;
      const [lead] = srcStage.leads.splice(idx, 1);
      dstStage.leads.push({ ...lead, stageId: targetStageId });
      return next;
    });
    setMovingLeadId(null);
    dragLeadRef.current = null;

    try {
      const targetStage = pipeline.find((s) => s.id === targetStageId);
      await api.updateLead(token, drag.leadId, { stageKey: targetStage?.key });
      toast.success(`Lead movido a ${targetStage?.name ?? ""}`);
    } catch {
      toast.error("Error al mover lead");
      loadPipeline(); // rollback
    }
  };

  if (loading) return <PageLoader text="Cargando embudo..." />;

  return (
    <div>
      <PageHeader
        title="Embudo de ventas"
        description="Arrastrá y soltá los leads entre etapas para gestionar tu flujo comercial"
      />

      {pipeline.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title="Sin etapas configuradas"
          description="Configurá etapas del embudo para visualizar tu flujo comercial"
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 h-[calc(100vh-180px)]">
          {pipeline.map((stage, idx) => {
            const isOver = dragOverStageId === stage.id;
            return (
              <div
                key={stage.id}
                className="min-w-[220px] flex-1 flex flex-col"
                onDragOver={(e) => onDragOver(e, stage.id)}
                onDragLeave={(e) => onDragLeave(e, stage.id)}
                onDrop={(e) => onDrop(e, stage.id)}
              >
                {/* Column header */}
                <div className="relative rounded-t-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-b-0 px-4 py-3 flex items-center justify-between">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-tl-xl bg-gradient-to-b ${STAGE_COLORS[idx % 7]} to-transparent`} />
                  <span className="font-semibold text-sm text-gray-700 dark:text-gray-300 pl-2">{stage.name}</span>
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {stage.leads?.length ?? 0}
                  </span>
                </div>

                {/* Drop zone */}
                <div
                  className={`border border-gray-200 dark:border-gray-700 border-t-0 rounded-b-xl p-2.5 space-y-2 flex-1 overflow-y-auto transition-colors duration-150 ${
                    isOver
                      ? "bg-brand-50/60 border-brand-300 ring-2 ring-brand-200/60"
                      : "bg-gray-50/50 dark:bg-gray-800/50"
                  }`}
                >
                  {(!stage.leads || stage.leads.length === 0) ? (
                    <div className={`flex items-center justify-center py-10 ${isOver ? "text-brand-400" : "text-gray-300"}`}>
                      <p className="text-xs">{isOver ? "Soltar aquí" : "Sin leads en esta etapa"}</p>
                    </div>
                  ) : (
                    stage.leads.map((lead: Lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, lead, stage.id)}
                        onDragEnd={onDragEnd}
                        className={`card p-3.5 group cursor-grab active:cursor-grabbing transition-all duration-150 ${
                          movingLeadId === lead.id
                            ? "opacity-40 scale-95 ring-2 ring-brand-300"
                            : "hover:shadow-card-hover"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-gray-300 mt-0.5 opacity-0 group-hover:opacity-100 transition shrink-0 pointer-events-none" />
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/dashboard/leads/${lead.id}`}
                              className="font-medium text-sm text-brand-600 hover:text-brand-700 hover:underline block truncate"
                              onClick={(e) => { if (movingLeadId) e.preventDefault(); }}
                              draggable={false}
                            >
                              {lead.name ?? "Sin nombre"}
                            </Link>
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                              {lead.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {lead.phone}
                                </span>
                              )}
                              {!lead.phone && lead.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" /> {lead.email}
                                </span>
                              )}
                              {!lead.phone && !lead.email && "Sin contacto"}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <StatusBadge status={lead.status} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Drop hint at bottom when dragging */}
                  {isOver && stage.leads && stage.leads.length > 0 && (
                    <div className="border-2 border-dashed border-brand-300 rounded-lg py-3 flex items-center justify-center">
                      <p className="text-xs text-brand-500 font-medium">Soltar aquí</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
