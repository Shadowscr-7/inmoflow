"use client";

import { useAuth } from "@/lib/auth";
import { api, type Message, type Lead } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, MessageSquare, Smile, Bot, UserRound } from "lucide-react";
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
    setTogglingAi(true);
    try {
      const newActive = !lead.aiConversationActive;
      const updated = await api.toggleAiConversation(token, leadId, newActive);
      setLead(updated);
      toast.success(newActive ? "🤖 IA conversacional activada" : "👤 IA desactivada — ahora respondés vos");
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
            {lead?.aiConversationActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 animate-pulse">
                <Bot className="w-3 h-3" /> IA activa
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

      {/* AI active banner */}
      {lead?.aiConversationActive && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg text-sm text-purple-700 dark:text-purple-300">
          <Bot className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            <strong>IA conversacional activa</strong> — la IA responde automáticamente a los mensajes de este lead.
            {lead.aiInstruction && (
              <span className="block text-xs mt-0.5 text-purple-500 dark:text-purple-400 truncate" title={lead.aiInstruction}>
                Instrucción: &quot;{lead.aiInstruction.slice(0, 100)}{lead.aiInstruction.length > 100 ? "…" : ""}&quot;
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <MessageSquare className="w-12 h-12 mb-3" />
            <p className="text-sm">Sin mensajes aún</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAi = !!(msg.rawPayload as Record<string, unknown>)?.aiGenerated;
            return (
              <div
                key={msg.id}
                className={`flex ${msg.direction === "OUT" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                    msg.direction === "OUT"
                      ? isAi
                        ? "bg-purple-600 text-white rounded-br-md"
                        : "bg-brand-600 text-white rounded-br-md"
                      : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md shadow-sm"
                  }`}
                >
                  {isAi && (
                    <div className="flex items-center gap-1 mb-1 text-xs opacity-75">
                      <Bot className="w-3 h-3" />
                      <span>Respuesta IA</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div
                    className={`flex items-center gap-2 mt-1.5 text-xs ${
                      msg.direction === "OUT"
                        ? isAi ? "text-purple-200" : "text-brand-200"
                        : "text-gray-400"
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
