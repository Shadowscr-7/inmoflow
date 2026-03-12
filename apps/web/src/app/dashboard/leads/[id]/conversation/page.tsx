"use client";

import { useAuth } from "@/lib/auth";
import { api, type Message, type Lead } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, MessageSquare, Smile, Bot, UserRound, FlaskConical } from "lucide-react";
import { ChannelBadge, useToast } from "@/components/ui";

export default function ConversationPage() {
  const { token } = useAuth();
  const toast = useToast();
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<string>("");
  const [togglingAi, setTogglingAi] = useState(false);
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [aiDemoMode, setAiDemoMode] = useState(false);
  const [aiDemoPhone, setAiDemoPhone] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadLead = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getLead(token, leadId);
      setLead(data);
      if (!channel && data.primaryChannel) {
        setChannel(data.primaryChannel);
      }
    } catch { /* */ }
  }, [token, leadId, channel]);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getMessages(token, leadId, { limit: "200" });
      setMessages(res.data);
    } catch { /* */ }
  }, [token, leadId]);

  // Sync messages from Evolution API then load
  const syncAndLoad = useCallback(async () => {
    if (!token) return;
    try {
      await api.syncMessages(token, leadId);
    } catch { /* sync failure is non-blocking */ }
    await loadMessages();
  }, [token, leadId, loadMessages]);

  // Initial load: sync from provider first, then load
  useEffect(() => { loadLead(); syncAndLoad(); }, [loadLead, syncAndLoad]);

  // Poll every 5s — sync + load each time
  useEffect(() => {
    const interval = setInterval(syncAndLoad, 5000);
    return () => clearInterval(interval);
  }, [syncAndLoad]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleToggleAi = async () => {
    if (!token || !lead) return;

    // If AI is active → deactivate directly
    if (lead.aiConversationActive) {
      setTogglingAi(true);
      try {
        const updated = await api.toggleAiConversation(token, leadId, false);
        setLead(updated);
        toast.success("👤 IA desactivada — ahora respondés vos");
      } catch (err) {
        toast.error(`Error: ${(err as Error).message}`);
      } finally {
        setTogglingAi(false);
      }
      return;
    }

    // If AI is inactive → show setup panel
    setAiDemoMode(lead.aiDemoMode ?? false);
    setAiDemoPhone(lead.aiDemoPhone ?? "");
    setAiGoal(lead.aiGoal ?? "");
    setShowAiSetup(true);
  };

  const handleActivateAi = async () => {
    if (!token || !lead) return;
    if (aiDemoMode && !aiDemoPhone.trim()) {
      toast.error("Ingresá el número de WhatsApp para probar");
      return;
    }
    setTogglingAi(true);
    try {
      const updated = await api.toggleAiConversation(
        token,
        leadId,
        true,
        undefined, // instruction stays from automation
        aiDemoMode,
        aiDemoMode ? aiDemoPhone.trim() : undefined,
        aiGoal.trim() || undefined,
      );
      setLead(updated);
      setShowAiSetup(false);
      toast.success(
        aiDemoMode
          ? "🧪 IA activada en modo DEMO — los mensajes irán a tu número de prueba"
          : "🤖 IA conversacional activada en producción",
      );
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setTogglingAi(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newMsg.trim() || !channel) return;
    setSending(true);
    try {
      await api.sendMessage(token, leadId, {
        content: newMsg.trim(),
        channel,
      });
      setNewMsg("");
      loadMessages();
      // Refresh lead in case AI was deactivated by server
      loadLead();
    } catch (err) {
      toast.error(`Error al enviar: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
        <Link href={`/dashboard/leads/${leadId}`} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg text-gray-900 dark:text-white">{lead?.name ?? "Conversación"}</h1>
            {lead?.aiConversationActive && !lead.aiDemoMode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 animate-pulse">
                <Bot className="w-3 h-3" /> IA activa
              </span>
            )}
            {lead?.aiConversationActive && lead.aiDemoMode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 animate-pulse">
                <FlaskConical className="w-3 h-3" /> DEMO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{lead?.phone ?? lead?.email ?? leadId.slice(0, 8)}</span>
            {lead?.primaryChannel && <ChannelBadge channel={lead.primaryChannel} />}
          </div>
        </div>

        {/* AI toggle button */}
        <button
          type="button"
          onClick={handleToggleAi}
          disabled={togglingAi}
          title={lead?.aiConversationActive ? "Desactivar IA y tomar control" : "Activar IA conversacional"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            lead?.aiConversationActive
              ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-500/25"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          {lead?.aiConversationActive ? (
            <>
              <UserRound className="w-4 h-4" />
              <span className="hidden sm:inline">Tomar control</span>
            </>
          ) : (
            <>
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">Activar IA</span>
            </>
          )}
        </button>

        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="input w-auto text-sm"
        >
          <option value="">Canal</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="TELEGRAM">Telegram</option>
        </select>
      </div>

      {/* AI Setup Panel (shown when activating AI) */}
      {showAiSetup && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Bot className="w-4 h-4" /> Activar IA conversacional
            </h3>
            <button onClick={() => setShowAiSetup(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>

          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAiDemoMode(false)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${!aiDemoMode ? "border-purple-500 bg-purple-50 dark:bg-purple-950" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Bot className={`w-4 h-4 ${!aiDemoMode ? "text-purple-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${!aiDemoMode ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-300"}`}>Producción</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">La IA responde directamente al lead real</p>
            </button>
            <button
              type="button"
              onClick={() => setAiDemoMode(true)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${aiDemoMode ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <FlaskConical className={`w-4 h-4 ${aiDemoMode ? "text-orange-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${aiDemoMode ? "text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-gray-300"}`}>Demo / Prueba</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Los mensajes van a tu número de prueba</p>
            </button>
          </div>

          {/* Demo phone input */}
          {aiDemoMode && (
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                Tu número de WhatsApp para probar (con código de país)
              </label>
              <input
                type="text"
                value={aiDemoPhone}
                onChange={(e) => setAiDemoPhone(e.target.value)}
                placeholder="ej: 59899123456"
                className="input text-sm"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Escribí desde este número y la IA te va a responder como si fueras el lead.
              </p>
            </div>
          )}

          {/* AI Goal */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
              🎯 Meta de la IA (opcional)
            </label>
            <input
              type="text"
              value={aiGoal}
              onChange={(e) => setAiGoal(e.target.value)}
              placeholder="ej: Agendar una visita al inmueble"
              className="input text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Cuando la IA logre esta meta, se desactiva automáticamente y te notifica.
            </p>
            {/* Quick presets */}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {["Agendar visita", "Calificar interés", "Obtener datos de contacto"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAiGoal(preset)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                    aiGoal === preset
                      ? "bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/40 dark:border-purple-700 dark:text-purple-300"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleActivateAi}
            disabled={togglingAi}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
              aiDemoMode
                ? "bg-orange-500 text-white hover:bg-orange-600"
                : "bg-purple-600 text-white hover:bg-purple-700"
            }`}
          >
            {togglingAi ? "Activando…" : aiDemoMode ? "🧪 Activar en modo Demo" : "🤖 Activar en Producción"}
          </button>
        </div>
      )}

      {/* AI active banner — Production mode */}
      {lead?.aiConversationActive && !lead.aiDemoMode && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg text-sm text-purple-700 dark:text-purple-300">
          <Bot className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            <strong>IA conversacional activa</strong> — la IA responde automáticamente a los mensajes de este lead.
            {lead.aiInstruction && (
              <span className="block text-xs mt-0.5 text-purple-500 dark:text-purple-400 truncate" title={lead.aiInstruction}>
                Instrucción: &quot;{lead.aiInstruction.slice(0, 100)}{lead.aiInstruction.length > 100 ? "…" : ""}&quot;
              </span>
            )}
            {lead.aiGoal && (
              <span className="block text-xs mt-0.5 text-purple-500 dark:text-purple-400">
                🎯 Meta: {lead.aiGoal}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleToggleAi}
            className="text-xs font-medium px-2 py-1 rounded bg-purple-200 hover:bg-purple-300 dark:bg-purple-800 dark:hover:bg-purple-700 transition"
          >
            Desactivar
          </button>
        </div>
      )}

      {/* AI active banner — Demo mode */}
      {lead?.aiConversationActive && lead.aiDemoMode && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-sm text-orange-700 dark:text-orange-300">
          <FlaskConical className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            <strong>Modo DEMO activo</strong> — la IA responde a tu número de prueba, no al lead real.
            {lead.aiDemoPhone && (
              <span className="block text-xs mt-0.5 text-orange-500 dark:text-orange-400">
                Número de prueba: {lead.aiDemoPhone}
              </span>
            )}
            {lead.aiInstruction && (
              <span className="block text-xs mt-0.5 text-orange-500 dark:text-orange-400 truncate" title={lead.aiInstruction}>
                Instrucción: &quot;{lead.aiInstruction.slice(0, 100)}{lead.aiInstruction.length > 100 ? "…" : ""}&quot;
              </span>
            )}
            {lead.aiGoal && (
              <span className="block text-xs mt-0.5 text-orange-500 dark:text-orange-400">
                🎯 Meta: {lead.aiGoal}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleToggleAi}
            className="text-xs font-medium px-2 py-1 rounded bg-orange-200 hover:bg-orange-300 dark:bg-orange-800 dark:hover:bg-orange-700 transition"
          >
            Desactivar
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <MessageSquare className="w-12 h-12 mb-3" />
            <p className="text-sm">Sin mensajes aún</p>
          </div>
        ) : (
          messages.map((msg) => {
            const raw = (msg.rawPayload ?? {}) as Record<string, unknown>;
            const isAi = !!raw.aiGenerated;
            const isDemo = !!raw.aiDemoMode || !!raw.aiDemoInbound;
            const isGoalAchieved = !!raw.aiGoalAchieved;
            const isNotInterested = !!raw.aiNotInterested;
            const stageAdvanced = raw.aiStageAdvanced as string | undefined;
            return (
              <div
                key={msg.id}
                className={`flex ${msg.direction === "OUT" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                    msg.direction === "OUT"
                      ? isAi
                        ? isDemo
                          ? "bg-orange-500 text-white rounded-br-md"
                          : "bg-purple-600 text-white rounded-br-md"
                        : "bg-brand-600 text-white rounded-br-md"
                      : isDemo
                        ? "bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-bl-md shadow-sm"
                        : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md shadow-sm"
                  }`}
                >
                  {isAi && (
                    <div className="flex items-center gap-1 mb-1 text-xs opacity-75">
                      {isDemo ? <FlaskConical className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                      <span>{isDemo ? "IA Demo" : "Respuesta IA"}</span>
                      {isGoalAchieved && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-100 text-[10px] font-medium">
                          🎯 Meta cumplida
                        </span>
                      )}
                      {isNotInterested && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-100 text-[10px] font-medium">
                          ❌ No interesado
                        </span>
                      )}
                      {stageAdvanced && !isGoalAchieved && !isNotInterested && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-100 text-[10px] font-medium">
                          📊 → {({QUALIFIED:"Calificado",NEGOTIATION:"Negociación",VISIT:"Visita"} as Record<string,string>)[stageAdvanced] ?? stageAdvanced}
                        </span>
                      )}
                    </div>
                  )}
                  {!isAi && isDemo && msg.direction === "IN" && (
                    <div className="flex items-center gap-1 mb-1 text-xs text-orange-500">
                      <FlaskConical className="w-3 h-3" />
                      <span>Mensaje de prueba</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div
                    className={`flex items-center gap-2 mt-1.5 text-xs ${
                      msg.direction === "OUT"
                        ? isAi
                          ? isDemo ? "text-orange-200" : "text-purple-200"
                          : "text-brand-200"
                        : isDemo ? "text-orange-400" : "text-gray-400"
                    }`}
                  >
                    <span>{msg.channel}</span>
                    <span>·</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>
                    {msg.direction === "OUT" && msg.status && (
                      <span>{msg.status === "sent" ? "✓" : msg.status}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Send box */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        {lead?.aiConversationActive && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
            <UserRound className="w-3 h-3" />
            Enviar un mensaje desactivará la IA y tomarás el control de la conversación.
          </p>
        )}
        <form onSubmit={handleSend} className="flex gap-3">
          <input
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder={channel ? `Escribir mensaje por ${channel}...` : "Seleccioná un canal"}
            disabled={!channel}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={sending || !channel || !newMsg.trim()}
            className="btn-primary px-5"
          >
            {sending ? <Smile className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
