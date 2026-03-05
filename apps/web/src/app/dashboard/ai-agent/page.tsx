"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  Bot,
  Save,
  Trash2,
  TestTube2,
  Send,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import {
  PageHeader,
  PageLoader,
  EmptyState,
  useToast,
  useConfirm,
} from "@/components/ui";

/* ─── Types ─────────────────────────────────────────── */
type ProviderInfo = { label: string; models: { value: string; label: string }[] };

/* ─── Provider logos / colors ─────────────────────── */
const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "bg-emerald-100 text-emerald-700 border-emerald-200",
  GEMINI: "bg-blue-100 text-blue-700 border-blue-200",
  CLAUDE: "bg-amber-100 text-amber-700 border-amber-200",
  GROK: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200",
  DEEPSEEK: "bg-indigo-100 text-indigo-700 border-indigo-200",
  QWEN: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function AiAgentPage() {
  const { user, token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const canManage = user?.role === "ADMIN" || user?.role === "BUSINESS";

  /* ─── State ─────────────────────────────────────── */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Providers catalog from API
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});

  // Config form state
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState("OPENAI");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyHint, setApiKeyHint] = useState("");
  const [model, setModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  // Test / Chat area
  const [testResult, setTestResult] = useState<{ ok: boolean; response?: string; error?: string } | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  /* ─── Load data ────────────────────────────────── */
  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [providerData, configData] = await Promise.all([
        api.getAiProviders(token),
        api.getAiConfig(token),
      ]);
      setProviders(providerData);

      if (configData.configured && configData.config) {
        const c = configData.config;
        setConfigured(true);
        setProvider(c.provider);
        setApiKeyHint(c.apiKeyHint);
        setApiKey(""); // don't show actual key
        setModel(c.model);
        setEnabled(c.enabled);
        setSystemPrompt(c.systemPrompt ?? "");
        setTemperature(c.temperature);
        setMaxTokens(c.maxTokens);
      } else {
        setConfigured(false);
        // Set default model for selected provider
        const firstProvider = Object.keys(providerData)[0] ?? "OPENAI";
        setProvider(firstProvider);
        const firstModel = providerData[firstProvider]?.models[0]?.value ?? "";
        setModel(firstModel);
      }
    } catch {
      toast.error("Error al cargar configuración de IA");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Update model when provider changes
  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const firstModel = providers[newProvider]?.models[0]?.value ?? "";
    setModel(firstModel);
  };

  /* ─── Save ─────────────────────────────────────── */
  const handleSave = async () => {
    if (!token) return;
    if (!apiKey && !configured) {
      toast.error("La API Key es obligatoria");
      return;
    }
    if (!model) {
      toast.error("Seleccioná un modelo");
      return;
    }

    setSaving(true);
    try {
      if (configured && !apiKey) {
        // Update without changing apiKey
        await api.updateAiConfig(token, {
          provider,
          model,
          enabled,
          systemPrompt: systemPrompt || undefined,
          temperature,
          maxTokens,
        });
      } else {
        await api.saveAiConfig(token, {
          provider,
          apiKey,
          model,
          enabled,
          systemPrompt: systemPrompt || undefined,
          temperature,
          maxTokens,
        });
      }
      toast.success("Configuración de IA guardada");
      setApiKey("");
      loadData();
    } catch (err) {
      toast.error((err as Error).message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  /* ─── Test connection ──────────────────────────── */
  const handleTest = async () => {
    if (!token) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testAiConnection(token, "Di 'hola' y el nombre del modelo que usás, en una línea.");
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  /* ─── Delete ───────────────────────────────────── */
  const handleDelete = async () => {
    if (!token) return;
    const ok = await confirm({
      title: "Eliminar configuración de IA",
      message: "¿Estás seguro? Las automatizaciones con IA dejarán de funcionar y usarán respuestas estáticas.",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api.deleteAiConfig(token);
      toast.success("Configuración eliminada");
      setConfigured(false);
      setApiKey("");
      setApiKeyHint("");
      setSystemPrompt("");
      setTestResult(null);
      setChatHistory([]);
      loadData();
    } catch (err) {
      toast.error((err as Error).message || "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Chat playground ──────────────────────────── */
  const handleChat = async () => {
    if (!token || !chatMessage.trim()) return;
    const userMsg = chatMessage.trim();
    setChatMessage("");
    setChatHistory((h) => [...h, { role: "user", content: userMsg }]);
    setChatLoading(true);
    try {
      const result = await api.chatWithAi(token, userMsg, chatHistory);
      setChatHistory((h) => [...h, { role: "assistant", content: result.response }]);
    } catch (err) {
      setChatHistory((h) => [...h, { role: "assistant", content: `Error: ${(err as Error).message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  /* ─── Render ───────────────────────────────────── */
  if (loading) return <PageLoader />;

  // Viewers and agents see read-only status
  if (!canManage) {
    return (
      <div>
        <PageHeader
          title="Agente IA"
          description="Estado del agente de inteligencia artificial"
        />
        <div className="card p-8 text-center">
          <Bot className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          {configured ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Agente IA {enabled ? "Activo" : "Pausado"}
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Proveedor: {providers[provider]?.label ?? provider} &middot; Modelo: {model}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Contactá a tu administrador para cambiar la configuración.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Sin agente IA configurado</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Tu empresa no tiene un agente de IA configurado. Las automatizaciones usarán respuestas estáticas.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Agente IA"
        description="Configurá tu proveedor de IA para respuestas inteligentes en automatizaciones y conversaciones"
        action={
          configured ? (
            <button onClick={handleDelete} disabled={deleting} className="btn-secondary text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── LEFT: Configuration form ──────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Provider selector */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              Proveedor de IA
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(providers).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => handleProviderChange(key)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    provider === key
                      ? `${PROVIDER_COLORS[key] ?? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300"} ring-2 ring-offset-2 ring-brand-500`
                      : "border-gray-200 hover:border-gray-300 bg-white dark:bg-gray-800"
                  }`}
                >
                  <p className="font-semibold text-sm">{info.label}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {info.models.length} modelo{info.models.length !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* API Key + Model */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Conexión</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={configured ? `••••••${apiKeyHint}` : "sk-..."}
                  className="input"
                />
                {configured && (
                  <p className="text-xs text-gray-400 mt-1">
                    Dejá en blanco para mantener la key actual
                  </p>
                )}
              </div>
              <div>
                <label className="label">Modelo</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="input"
                >
                  {(providers[provider]?.models ?? []).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled(!enabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enabled ? "bg-brand-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {enabled ? "Agente activado" : "Agente desactivado"}
              </span>
            </div>
          </div>

          {/* System prompt */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Prompt del sistema</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Instrucciones generales que el agente siempre seguirá. Cada automatización puede agregar instrucciones propias.
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Eres un asistente virtual de una inmobiliaria. Responde de forma profesional y amable. Siempre ofrece agendar una visita cuando sea posible..."
              rows={6}
              maxLength={10000}
              className="input resize-y min-h-[120px]"
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-[11px] text-gray-400">
                {systemPrompt.length.toLocaleString()} / 10.000 caracteres
              </p>
            </div>
          </div>

          {/* Advanced settings */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Configuración avanzada</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">
                  Temperatura ({temperature.toFixed(1)})
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>Preciso (0)</span>
                  <span>Creativo (2)</span>
                </div>
              </div>
              <div>
                <label className="label">Máx. tokens</label>
                <input
                  type="number"
                  min={64}
                  max={32000}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Math.max(64, Math.min(32000, parseInt(e.target.value) || 1024)))}
                  className="input"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Longitud máxima de las respuestas (64 - 32.000)
                </p>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
              ) : (
                <><Save className="w-4 h-4" /> Guardar configuración</>
              )}
            </button>
            {configured && (
              <button onClick={handleTest} disabled={testing} className="btn-secondary">
                {testing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Probando...</>
                ) : (
                  <><TestTube2 className="w-4 h-4" /> Probar conexión</>
                )}
              </button>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`card p-4 border-l-4 ${testResult.ok ? "border-l-green-500 bg-green-50/50" : "border-l-red-500 bg-red-50/50"}`}>
              <div className="flex items-start gap-2">
                {testResult.ok ? (
                  <Check className="w-5 h-5 text-green-600 mt-0.5" />
                ) : (
                  <X className="w-5 h-5 text-red-600 mt-0.5" />
                )}
                <div>
                  <p className={`text-sm font-medium ${testResult.ok ? "text-green-800" : "text-red-800"}`}>
                    {testResult.ok ? "Conexión exitosa" : "Error de conexión"}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {testResult.ok ? testResult.response : testResult.error}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT: Chat playground ────────────── */}
        <div className="lg:col-span-1">
          <div className="card p-0 overflow-hidden sticky top-4">
            {/* Chat header */}
            <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Playground
              </h3>
              <p className="text-[11px] text-brand-100 mt-0.5">
                Probá el agente en tiempo real
              </p>
            </div>

            {!configured ? (
              <div className="p-6 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Guardá la configuración primero para probar el chat.</p>
              </div>
            ) : (
              <>
                {/* Messages area */}
                <div className="h-[400px] overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-gray-800/50">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-8">
                      <Bot className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                      <p className="text-xs text-gray-400">Enviá un mensaje para probar el agente</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                          msg.role === "user"
                            ? "bg-brand-600 text-white rounded-br-md"
                            : "bg-white dark:bg-gray-800 border border-gray-200 text-gray-700 dark:text-gray-300 rounded-bl-md shadow-sm"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-3 border-t border-gray-200 bg-white dark:bg-gray-800">
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleChat(); }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Escribí un mensaje..."
                      className="input flex-1"
                      disabled={chatLoading}
                    />
                    <button
                      type="submit"
                      disabled={chatLoading || !chatMessage.trim()}
                      className="btn-primary px-3"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                  {chatHistory.length > 0 && (
                    <button
                      onClick={() => setChatHistory([])}
                      className="text-[11px] text-gray-400 hover:text-gray-600 dark:text-gray-400 mt-2 transition"
                    >
                      Limpiar historial
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
