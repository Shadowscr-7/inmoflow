import Anthropic from "@anthropic-ai/sdk";

// ─── Config ───────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");

const TELEGRAM = `https://api.telegram.org/bot${BOT_TOKEN}`;
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── Conversation history per chat (in-memory) ────────────
/** @type {Map<number, import("@anthropic-ai/sdk").MessageParam[]>} */
const conversations = new Map();

const SYSTEM_PROMPT = `Sos Claude, un asistente de IA de Anthropic. Estás respondiendo mensajes desde Telegram.
Respondé de forma concisa y útil. Podés usar formato Markdown básico compatible con Telegram:
*negrita*, _itálica_, \`código\`, \`\`\`bloque de código\`\`\`, [link](url).`;

// ─── Telegram helpers ─────────────────────────────────────
async function telegramRequest(method, body = {}) {
  const res = await fetch(`${TELEGRAM}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.error(`Telegram error [${method}]:`, data.description);
  return data;
}

async function sendMessage(chatId, text) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}

async function sendTyping(chatId) {
  return telegramRequest("sendChatAction", {
    chat_id: chatId,
    action: "typing",
  });
}

// ─── Claude response ──────────────────────────────────────
async function askClaude(chatId, userMessage) {
  if (!conversations.has(chatId)) conversations.set(chatId, []);
  const history = conversations.get(chatId);

  history.push({ role: "user", content: userMessage });

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: history,
    thinking: { type: "adaptive" },
  });

  const assistantText = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  history.push({ role: "assistant", content: response.content });

  // Keep last 40 turns to avoid context overflow
  if (history.length > 40) {
    conversations.set(chatId, history.slice(-40));
  }

  return assistantText;
}

// ─── Update handler ───────────────────────────────────────
async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const username = msg.from?.first_name || msg.from?.username || "Usuario";

  console.log(`[${new Date().toISOString()}] ${username} (${chatId}): ${text}`);

  // Commands
  if (text === "/start") {
    conversations.delete(chatId);
    await sendMessage(chatId, `¡Hola ${username}! Soy Claude, tu asistente de IA. ¿En qué te puedo ayudar?\n\n_Comandos disponibles:_\n/reset — Borrar el historial de conversación`);
    return;
  }

  if (text === "/reset") {
    conversations.delete(chatId);
    await sendMessage(chatId, "✅ Historial borrado. Empezamos de cero.");
    return;
  }

  // Show typing indicator and call Claude
  try {
    // Keep sending typing while Claude thinks
    const typingInterval = setInterval(() => sendTyping(chatId), 4000);
    await sendTyping(chatId);

    const reply = await askClaude(chatId, text);

    clearInterval(typingInterval);
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("Error:", err.message);
    await sendMessage(chatId, "❌ Ocurrió un error al procesar tu mensaje. Intentá de nuevo.");
  }
}

// ─── Long-polling loop ────────────────────────────────────
async function poll() {
  let offset = 0;

  console.log("🤖 Claude Telegram Bot iniciado. Esperando mensajes...");

  // Get bot info
  const me = await telegramRequest("getMe");
  if (me.ok) console.log(`✅ Bot conectado: @${me.result.username}`);

  while (true) {
    try {
      const data = await telegramRequest("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "edited_message"],
      });

      if (!data.ok || !data.result?.length) continue;

      for (const update of data.result) {
        offset = update.update_id + 1;
        handleUpdate(update).catch(console.error);
      }
    } catch (err) {
      console.error("Polling error:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

poll();
