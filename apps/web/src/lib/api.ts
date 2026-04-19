export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REQUEST_TIMEOUT_MS = 30_000;

type FetchOptions = RequestInit & {
  token?: string;
  /** Skip the global 401 handler (used for login / refresh endpoints) */
  skipUnauthorizedHandler?: boolean;
  /** Custom timeout in ms (default: REQUEST_TIMEOUT_MS) */
  timeoutMs?: number;
};

// Global 401 handler — set by AuthProvider
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: () => void) {
  onUnauthorized = cb;
}

async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, headers, skipUnauthorizedHandler, ...rest } = options;

  const { timeoutMs, ...rest2 } = rest as FetchOptions;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      ...rest2,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    if (!res.ok) {
      if (res.status === 401 && onUnauthorized && !skipUnauthorizedHandler) {
        onUnauthorized();
      }
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      throw new ApiError(res.status, body.message ?? res.statusText, body);
    }

    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth ─────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    tenantId: string | null;
    email: string;
    role: string;
    name: string | null;
  };
}

export function login(email: string, password: string) {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipUnauthorizedHandler: true,
  });
}

export function refreshAccessToken(refreshToken: string) {
  return apiFetch<{ access_token: string }>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
    skipUnauthorizedHandler: true,
  });
}

export function getProfile(token: string) {
  return apiFetch<{ id: string; email: string; name: string | null; role: string; tenantId: string | null; createdAt: string; tenant: { id: string; name: string } | null }>("/auth/me", { token });
}

export function updateProfile(token: string, data: { name?: string; password?: string; currentPassword?: string }) {
  return apiFetch<{ id: string; email: string; name: string | null; role: string }>("/auth/me", {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Leads ────────────────────────────────────────────

export interface Lead {
  id: string;
  tenantId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  intent: string | null;
  score: number | null;
  temperature: "COLD" | "WARM" | "HOT" | null;
  notes: string | null;
  stageId: string | null;
  assigneeId: string | null;
  primaryChannel: string | null;
  aiConversationActive: boolean;
  aiInstruction: string | null;
  aiRuleId: string | null;
  aiDemoMode: boolean;
  aiDemoPhone: string | null;
  aiGoal: string | null;
  createdAt: string;
  updatedAt: string;
  stage: { id: string; key: string; name: string; order: number } | null;
  assignee: { id: string; name: string | null; email: string } | null;
  source: { id: string; name: string; type: string } | null;
}

export interface LeadsResponse {
  data: Lead[];
  total: number;
  limit: number;
  offset: number;
}

export interface PipelineStage {
  id: string;
  key: string;
  name: string;
  order: number;
  _count: { leads: number };
  leads: Lead[];
}

export interface EventLogEntry {
  id: string;
  type: string;
  entity: string | null;
  entityId: string | null;
  status: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string | null;
  email: string;
  name: string | null;
  role: string;
  isActive?: boolean;
  createdAt?: string;
  tenant?: { id: string; name: string } | null;
}

export interface Channel {
  id: string;
  tenantId: string;
  userId: string;
  type: "WHATSAPP" | "TELEGRAM" | "META" | "WEB";
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR";
  providerInstanceId: string | null;
  telegramChatId: string | null;
  metaPageId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string | null; email: string; role: string };
}

export interface WhatsAppConnectResponse {
  channelId: string;
  status: string;
  instanceName: string;
  qrCode: string | null;
  pairingCode: string | null;
}

export interface Message {
  id: string;
  tenantId: string;
  leadId: string;
  direction: "IN" | "OUT";
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
  providerMessageId: string | null;
  from: string | null;
  to: string | null;
  content: string;
  status: string | null;
  error: string | null;
  rawPayload?: { aiGenerated?: boolean; aiAutoReply?: boolean; provider?: string; model?: string } | null;
  createdAt: string;
}

export interface MessagesResponse {
  data: Message[];
  total: number;
  limit: number;
  offset: number;
}

export interface MessageHistoryItem extends Message {
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    assignee: { id: string; name: string | null; email: string } | null;
  } | null;
}

export interface MessageHistoryResponse {
  data: MessageHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Lead Sources ─────────────────────────────────────

export interface LeadSource {
  id: string;
  tenantId: string;
  type: "META_LEAD_AD" | "WEB_FORM" | "WHATSAPP_INBOUND" | "TELEGRAM_INBOUND" | "MANUAL" | "WEBHOOK";
  name: string;
  metaPageId: string | null;
  metaFormId: string | null;
  metaPageName: string | null;
  metaFormName: string | null;
  webFormKey: string | null;
  apiKey: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

// ─── Templates ────────────────────────────────────────

export interface TemplateAttachment {
  url: string;
  originalName: string;
  mimeType: string;
  size?: number;
}

export interface Template {
  id: string;
  tenantId: string;
  userId: string | null;
  key: string;
  name: string;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB" | null;
  content: string;
  attachments: TemplateAttachment[] | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string | null; email: string; role: string } | null;
}

// ─── Rules ────────────────────────────────────────────

export interface RuleAction {
  type: "assign" | "assign_by_form_name" | "send_template" | "change_status" | "change_stage" | "add_note" | "notify" | "send_ai_message" | "wait";
  userId?: string;
  templateKey?: string;
  value?: string;
  content?: string;
  channel?: string;
  delayMs?: number;
}

export interface Rule {
  id: string;
  tenantId: string;
  userId: string | null;
  name: string;
  enabled: boolean;
  trigger: string;
  priority: number;
  conditions: Record<string, unknown>;
  actions: RuleAction[];
  workingHours: WorkingHours | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string | null; email: string; role: string } | null;
}

export interface WorkingHoursSchedule {
  day: number;
  from: string;
  to: string;
}

export interface WorkingHours {
  enabled: boolean;
  timezone: string;
  schedule: WorkingHoursSchedule[];
}

export interface QueuedAction {
  id: string;
  tenantId: string;
  ruleId: string;
  leadId: string;
  assigneeId: string | null;
  trigger: string;
  context: Record<string, unknown>;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
  processAt: string | null;
  rule?: { id: string; name: string; trigger: string; actions?: RuleAction[]; conditions?: Record<string, unknown> };
  messageOverride?: string | null;
  lead?: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    source?: {
      id: string;
      name: string;
      type: string;
      metaFormName: string | null;
      metaPageName: string | null;
    } | null;
  } | null;
  assignee?: { id: string; name: string | null; email: string } | null;
}

// ─── Notifications ────────────────────────────────────

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  data: Notification[];
  total: number;
  unread: number;
}

// ─── Dashboard ────────────────────────────────────────

export interface DashboardStats {
  summary: {
    totalLeads: number;
    leadsToday: number;
    leadsThisWeek: number;
    leadsThisMonth: number;
    wonLeads: number;
    lostLeads: number;
    conversionRate: number;
    activeChannels: number;
    totalChannels: number;
    totalMessages: number;
    messagesIn: number;
    messagesOut: number;
    totalUsers: number;
    activeRules: number;
    totalTemplates: number;
  };
  statusCounts: Record<string, number>;
  pipeline: Array<{ id: string; key: string; name: string; order: number; count: number }>;
  leadsBySource: Array<{ name: string; count: number }>;
  leadsTimeline: Array<{ date: string; count: number }>;
  recentLeads: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    score: number | null;
    stage: string | null;
    assignee: string | null;
    source: string | null;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    entity: string | null;
    message: string | null;
    createdAt: string;
  }>;
}

// ─── Tags ─────────────────────────────────────────────

export interface Tag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  createdAt: string;
  _count?: { leads: number };
}

export interface LeadTag {
  id: string;
  leadId: string;
  tagId: string;
  tag: Tag;
}

// ─── Custom Fields ────────────────────────────────────

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  name: string;
  fieldType: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN";
  options: string[];
  required: boolean;
  order: number;
  createdAt: string;
}

export interface CustomFieldValue {
  id: string;
  leadId: string;
  definitionId: string;
  value: string;
  definition: CustomFieldDefinition;
}

// ─── Properties ───────────────────────────────────────

export interface Property {
  id: string;
  tenantId: string;
  code: string | null;
  title: string;
  description: string | null;
  status: string;
  price: number | null;
  currency: string | null;
  propertyType: string | null;
  operationType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  floors: number | null;
  hasGarage: boolean | null;
  zone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  slug: string;
  amenities: string | null;
  publishedAt: string | null;
  meliItemId: string | null;
  meliPermalink: string | null;
  meliSyncedAt: string | null;
  meliStatus: string | null;
  meliSellerId: string | null;
  assignedUserId: string | null;
  assignedUser?: { id: string; name: string | null; email: string } | null;
  createdAt: string;
  updatedAt: string;
  media?: PropertyMedia[];
  _count?: { visits: number };
}

export interface PropertyMedia {
  id: string;
  url: string;
  kind: string;
  thumbnailUrl: string | null;
  order: number;
}

// ─── MercadoLibre ─────────────────────────────────────

export interface MeliStatus {
  connected: boolean;
  userId: string | null;
  lastSync: string | null;
}

export interface MeliItemPreview {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  permalink: string | null;
  status: string | null;
  thumbnail: string | null;
  hasVideo: boolean;
  pictureCount: number;
}

export interface MeliSyncResult {
  total: number;
  created: number;
  updated: number;
  errors: number;
  sellers: MeliSellerSummary[];
}

export interface MeliSellerSummary {
  meliSellerId: string;
  nickname: string;
  itemCount: number;
  agentId: string | null;
  agentName: string | null;
}

export interface PropertiesResponse {
  data: Property[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Agent Availability ───────────────────────────────

export interface AgentAvailability {
  id: string;
  tenantId: string;
  userId: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
  active: boolean;
}

// ─── Visits ───────────────────────────────────────────

export interface Visit {
  id: string;
  tenantId: string;
  leadId: string;
  propertyId: string | null;
  agentId: string | null;
  date: string;
  endDate: string | null;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  notes: string | null;
  address: string | null;
  googleEventId?: string | null;
  reminderSent?: boolean;
  createdByAi?: boolean;
  createdAt: string;
  updatedAt: string;
  lead?: { id: string; name: string | null; phone: string | null; email: string | null };
  property?: { id: string; title: string; address: string | null };
}

// ─── Follow-Up Sequences ─────────────────────────────

export interface FollowUpStep {
  id: string;
  order: number;
  delayHours: number;
  channel: string | null;
  content: string;
}

export interface FollowUpSequence {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  trigger: string;
  createdAt: string;
  updatedAt: string;
  steps: FollowUpStep[];
  _count?: { runs: number };
}

export interface FollowUpRun {
  id: string;
  sequenceId: string;
  leadId: string;
  currentStep: number;
  status: string;
  nextRunAt: string | null;
  lead?: { id: string; name: string | null; phone: string | null };
  sequence?: { id: string; name: string };
}

// ─── Import ──────────────────────────────────────────

export interface ImportPreview {
  columns: string[];
  rows: Record<string, string>[];
  count: number;
}

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

// ─── Reports ─────────────────────────────────────────

export interface SummaryReport {
  period: { from: string; to: string };
  leads: {
    total: number;
    byStatus: Record<string, number>;
    byStage: Record<string, number>;
    bySource: Record<string, number>;
    byAssignee?: Record<string, number>;
    conversionRate?: number;
  };
  properties: { total: number };
  visits: {
    total: number;
    byStatus: Record<string, number>;
  };
  messages?: {
    total: number;
    byChannel: Record<string, number>;
  };
}

// ─── Lead Scoring ─────────────────────────────────────

export interface ScoringBreakdown {
  score: number;
  temperature: "HOT" | "WARM" | "COLD";
  factors: { factor: string; points: number; maxPoints: number; detail: string }[];
}

// ─── Agent Performance ────────────────────────────────

export interface AgentMetrics {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  totalLeads: number;
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  totalMessages: number;
  messagesSent: number;
  messagesReceived: number;
  totalVisits: number;
  completedVisits: number;
  avgResponseTimeMinutes: number | null;
  goals: {
    leadsTarget: number;
    leadsActual: number;
    visitsTarget: number;
    visitsActual: number;
    wonTarget: number;
    wonActual: number;
  } | null;
}

export interface Leaderboard {
  byWon: AgentMetrics[];
  byConversion: AgentMetrics[];
  byVisits: AgentMetrics[];
  byMessages: AgentMetrics[];
}

// ─── Notification Preferences ─────────────────────────

export interface NotificationPreference {
  id: string;
  tenantId: string;
  userId: string;
  pushEnabled: boolean;
  emailDigest: "NONE" | "DAILY" | "WEEKLY";
  pushSubscription: unknown;
  createdAt: string;
  updatedAt: string;
}

// ─── Public Property ──────────────────────────────────

export interface PublicProperty {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  hasGarage: boolean | null;
  zone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  slug: string;
  publishedAt: string | null;
  media: { url: string; kind: string | null; order: number }[];
  tenant: string;
  tenantId: string;
}

// ─── WhatsApp Share ───────────────────────────────────

export interface WhatsAppShare {
  whatsappUrl: string;
  message: string;
  publicUrl: string;
}

// ─── Commissions ──────────────────────────────────────

export interface CommissionRule {
  id: string;
  tenantId: string;
  operationType: "SALE" | "RENT" | "RENT_TEMPORARY";
  percentage: number;
  splitAgentPct: number;
  splitBizPct: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Commission {
  id: string;
  tenantId: string;
  agentId: string;
  leadId: string | null;
  propertyId: string | null;
  operationType: "SALE" | "RENT" | "RENT_TEMPORARY";
  dealAmount: number;
  commissionPct: number;
  commissionTotal: number;
  agentPct: number;
  agentAmount: number;
  bizAmount: number;
  status: "PENDING" | "APPROVED" | "PAID" | "CANCELLED";
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionSummary {
  totalDeals: number;
  totalCommission: number;
  totalAgentAmount: number;
  totalBizAmount: number;
  byStatus: Record<string, number>;
  byAgent: Record<string, { deals: number; commission: number; agentAmount: number; status: Record<string, number> }>;
  byOperation: Record<string, { deals: number; commission: number }>;
}

export interface LeadRecoveryItem {
  leadgenId: string;
  sourceId: string;
  formId: string;
  pageId: string;
  formName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvalId: string | null;
  leadId: string | null;
  createdTime: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  customFields: Record<string, string>;
  adName: string | null;
  campaignName: string | null;
}

export interface LeadRecoveryResult {
  items: LeadRecoveryItem[];
  total: number;
  sources: number;
}

export const api = {
  // Dashboard
  getDashboardStats(token: string) {
    return apiFetch<DashboardStats>("/dashboard/stats", { token });
  },

  // Leads
  getLeads(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<LeadsResponse>(`/leads${qs}`, { token });
  },
  getLead(token: string, id: string) {
    return apiFetch<Lead & { messages: unknown[]; profile: unknown }>(`/leads/${id}`, { token });
  },
  createLead(token: string, data: Record<string, unknown>) {
    return apiFetch<Lead>("/leads", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateLead(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<Lead>(`/leads/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  toggleAiConversation(token: string, leadId: string, active: boolean, instruction?: string, demoMode?: boolean, demoPhone?: string, goal?: string) {
    return apiFetch<Lead>(`/leads/${leadId}/ai`, {
      token,
      method: "PATCH",
      body: JSON.stringify({
        active,
        ...(instruction !== undefined && { instruction }),
        ...(demoMode !== undefined && { demoMode }),
        ...(demoPhone !== undefined && { demoPhone }),
        ...(goal !== undefined && { goal }),
      }),
    });
  },
  deleteLead(token: string, id: string) {
    return apiFetch<void>(`/leads/${id}`, { token, method: "DELETE" });
  },
  getStages(token: string) {
    return apiFetch<PipelineStage[]>("/leads/stages", { token });
  },
  getPipeline(token: string) {
    return apiFetch<PipelineStage[]>("/leads/pipeline", { token });
  },
  getLeadTimeline(token: string, leadId: string) {
    return apiFetch<EventLogEntry[]>(`/leads/${leadId}/timeline`, { token });
  },

  // Users
  getUsers(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<User[]>(`/users${qs}`, { token });
  },
  getUser(token: string, id: string) {
    return apiFetch<User>(`/users/${id}`, { token });
  },
  createUser(token: string, data: Record<string, unknown>) {
    return apiFetch<User>("/users", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateUser(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<User>(`/users/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteUser(token: string, id: string) {
    return apiFetch<User>(`/users/${id}`, { token, method: "DELETE" });
  },

  // Event logs
  getEventLogs(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<EventLogEntry[]>(`/event-logs${qs}`, { token });
  },

  // Tenant
  getTenant(token: string) {
    return apiFetch<{ id: string; name: string; plan: string }>("/tenants/me", { token });
  },
  getTenants(token: string) {
    return apiFetch<{ id: string; name: string; plan: string; createdAt: string; _count: { users: number } }[]>("/tenants", { token });
  },
  createTenant(token: string, data: { name: string; plan?: string }) {
    return apiFetch("/tenants", { token, method: "POST", body: JSON.stringify(data) });
  },

  // ─── Channels ─────────────────────────────────────
  getChannels(token: string) {
    return apiFetch<Channel[]>("/channels", { token });
  },
  getMyChannels(token: string) {
    return apiFetch<Channel[]>("/channels/mine", { token });
  },
  connectWhatsApp(token: string) {
    return apiFetch<WhatsAppConnectResponse>("/channels/whatsapp/connect", { token, method: "POST" });
  },
  getWhatsAppQr(token: string) {
    return apiFetch<{ qrCode: string | null; pairingCode?: string; status: string }>("/channels/whatsapp/qr", { token });
  },
  disconnectWhatsApp(token: string) {
    return apiFetch<{ ok: boolean; status: string }>("/channels/whatsapp/disconnect", { token, method: "POST" });
  },
  resetWhatsApp(token: string) {
    return apiFetch<{ ok: boolean }>("/channels/whatsapp/reset", { token, method: "POST" });
  },
  reregisterWhatsAppWebhook(token: string) {
    return apiFetch<{ success: boolean; webhookUrl: string; message: string }>("/channels/whatsapp/reregister-webhook", { token, method: "POST" });
  },
  connectTelegram(token: string) {
    return apiFetch<{ channelId: string; status: string; startLink: string }>("/channels/telegram/connect", { token, method: "POST" });
  },
  getTelegramStatus(token: string) {
    return apiFetch<{ connected: boolean; status: string; chatId: string | null }>("/channels/telegram/status", { token });
  },
  deleteChannel(token: string, id: string) {
    return apiFetch<void>(`/channels/${id}`, { token, method: "DELETE" });
  },
  disconnectChannel(token: string, id: string) {
    return apiFetch<void>(`/channels/${id}/disconnect`, { token, method: "POST" });
  },

  // ─── Messages ─────────────────────────────────────
  getMessages(token: string, leadId: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<MessagesResponse>(`/messages/${leadId}${qs}`, { token });
  },
  sendMessage(token: string, leadId: string, data: { content: string; channel?: string }) {
    return apiFetch<Message>(`/messages/${leadId}/send`, { token, method: "POST", body: JSON.stringify(data) });
  },
  syncMessages(token: string, leadId: string) {
    return apiFetch<{ synced: number }>(`/messages/${leadId}/sync`, { token, method: "POST" });
  },
  retryMessage(token: string, leadId: string, messageId: string) {
    return apiFetch<{ queued: boolean }>(`/messages/${leadId}/${messageId}/retry`, { token, method: "POST" });
  },
  getMessageHistory(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<MessageHistoryResponse>(`/messages/history${qs}`, { token });
  },

  // ─── Lead Sources ─────────────────────────────────
  getLeadSources(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<LeadSource[]>(`/lead-sources${qs}`, { token });
  },
  createLeadSource(token: string, data: Record<string, unknown>) {
    return apiFetch<LeadSource>("/lead-sources", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateLeadSource(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<LeadSource>(`/lead-sources/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteLeadSource(token: string, id: string) {
    return apiFetch<void>(`/lead-sources/${id}`, { token, method: "DELETE" });
  },
  regenerateWebhookKey(token: string, id: string) {
    return apiFetch<LeadSource>(`/lead-sources/${id}/regenerate-key`, { token, method: "POST" });
  },

  // ─── Templates ────────────────────────────────────
  getTemplates(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Template[]>(`/templates${qs}`, { token });
  },
  getMyTemplates(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Template[]>(`/templates/mine${qs}`, { token });
  },
  getTemplate(token: string, id: string) {
    return apiFetch<Template>(`/templates/${id}`, { token });
  },
  createTemplate(token: string, data: Record<string, unknown>) {
    return apiFetch<Template>("/templates", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateTemplate(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<Template>(`/templates/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteTemplate(token: string, id: string) {
    return apiFetch<void>(`/templates/${id}`, { token, method: "DELETE" });
  },

  // ─── Uploads ──────────────────────────────────────
  async uploadFiles(token: string, files: File[]): Promise<TemplateAttachment[]> {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    const res = await fetch(`${API_URL}/api/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      throw new ApiError(res.status, body.message ?? res.statusText, body);
    }

    return res.json();
  },

  // ─── Rules ────────────────────────────────────────
  getRules(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Rule[]>(`/rules${qs}`, { token });
  },
  getMyRules(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Rule[]>(`/rules/mine${qs}`, { token });
  },
  getRule(token: string, id: string) {
    return apiFetch<Rule>(`/rules/${id}`, { token });
  },
  createRule(token: string, data: Record<string, unknown>) {
    return apiFetch<Rule>("/rules", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateRule(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<Rule>(`/rules/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteRule(token: string, id: string) {
    return apiFetch<void>(`/rules/${id}`, { token, method: "DELETE" });
  },

  // ─── Queued Actions ───────────────────────────────
  getQueuedActions(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<QueuedAction[]>(`/queued-actions${qs}`, { token });
  },
  getQueuedActionsCount(token: string) {
    return apiFetch<{ pending: number }>("/queued-actions/count", { token });
  },
  cancelQueuedAction(token: string, id: string) {
    return apiFetch<QueuedAction>(`/queued-actions/${id}/cancel`, { token, method: "PATCH" });
  },
  cancelAllQueuedActions(token: string) {
    return apiFetch<{ cancelled: number }>("/queued-actions/cancel-all", { token, method: "DELETE" });
  },
  retryQueuedAction(token: string, id: string) {
    return apiFetch<QueuedAction>(`/queued-actions/${id}/retry`, { token, method: "PATCH" });
  },
  updateQueuedActionMessage(token: string, id: string, message: string | null) {
    return apiFetch<QueuedAction>(`/queued-actions/${id}/message`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ message }),
    });
  },

  // ─── Notifications ────────────────────────────────
  getNotifications(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<NotificationsResponse>(`/notifications${qs}`, { token });
  },
  markNotificationRead(token: string, id: string) {
    return apiFetch<Notification>(`/notifications/${id}/read`, { token, method: "PATCH" });
  },
  markAllNotificationsRead(token: string) {
    return apiFetch<{ count: number }>("/notifications/read-all", { token, method: "PATCH" });
  },

  // ─── Pipeline Stages CRUD ─────────────────────────
  createStage(token: string, data: Record<string, unknown>) {
    return apiFetch<PipelineStage>("/leads/stages", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateStage(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<PipelineStage>(`/leads/stages/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteStage(token: string, id: string) {
    return apiFetch<void>(`/leads/stages/${id}`, { token, method: "DELETE" });
  },
  reorderStages(token: string, ids: string[]) {
    return apiFetch<PipelineStage[]>("/leads/stages/reorder", { token, method: "PATCH", body: JSON.stringify({ ids }) });
  },

  // ─── Meta OAuth ───────────────────────────────────
  getMetaStatus(token: string) {
    return apiFetch<{ configured: boolean; connected: boolean; metaUserId?: string; metaUserName?: string; error?: string }>("/meta/status", { token });
  },
  getMetaAuthUrl(token: string) {
    return apiFetch<{ url: string }>("/meta/auth-url", { token });
  },
  getMetaPages(token: string) {
    return apiFetch<{ id: string; name: string; category?: string }[]>("/meta/pages", { token });
  },
  getMetaForms(token: string, pageId: string) {
    return apiFetch<{ id: string; name: string; status: string }[]>(`/meta/pages/${pageId}/forms`, { token });
  },
  connectMetaPageForm(token: string, data: { pageId: string; formId?: string; pageName: string; formName?: string }) {
    return apiFetch<LeadSource>("/meta/connect", { token, method: "POST", body: JSON.stringify(data) });
  },
  disconnectMeta(token: string) {
    return apiFetch<{ ok: boolean }>("/meta/disconnect", { token, method: "DELETE" });
  },
  metaResyncLead(token: string, leadId: string) {
    return apiFetch<{ updated: boolean; fields?: string[]; reason?: string }>(`/leads/${leadId}/meta-resync`, { token, method: "POST" });
  },

  // ─── AI Agent ─────────────────────────────────────
  getAiConfig(token: string) {
    return apiFetch<{
      configured: boolean;
      config?: {
        id: string;
        provider: string;
        apiKeyHint: string;
        model: string;
        enabled: boolean;
        systemPrompt: string | null;
        temperature: number;
        maxTokens: number;
      };
    }>("/ai/config", { token });
  },
  getAiProviders(token: string) {
    return apiFetch<Record<string, { label: string; models: { value: string; label: string }[] }>>(
      "/ai/providers",
      { token },
    );
  },
  saveAiConfig(token: string, data: {
    provider: string;
    apiKey: string;
    model: string;
    enabled?: boolean;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    return apiFetch("/ai/config", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateAiConfig(token: string, data: Record<string, unknown>) {
    return apiFetch("/ai/config", { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteAiConfig(token: string) {
    return apiFetch<{ ok: boolean }>("/ai/config", { token, method: "DELETE" });
  },
  testAiConnection(token: string, message?: string) {
    return apiFetch<{ ok: boolean; response?: string; provider?: string; model?: string; error?: string }>(
      "/ai/test",
      { token, method: "POST", body: JSON.stringify({ message }) },
    );
  },
  chatWithAi(token: string, message: string, history?: { role: string; content: string }[]) {
    return apiFetch<{ response: string; provider: string; model: string }>(
      "/ai/chat",
      { token, method: "POST", body: JSON.stringify({ message, history }) },
    );
  },
  getLeadAiSummary(token: string, leadId: string) {
    return apiFetch<{ summary: string; provider: string; model: string; leadName: string }>(
      `/ai/lead-summary/${leadId}`,
      { token, method: "POST" },
    );
  },

  // ─── Plan ─────────────────────────────────────────
  getPlanLimits(token: string) {
    return apiFetch<{
      plan: string;
      planLabel: string;
      maxUsers: number;
      maxRules: number;
      maxChannels: number;
      allowedChannels: string[];
      aiEnabled: boolean;
      metaLeads: boolean;
    }>("/plan", { token });
  },
  updateTenant(token: string, tenantId: string, data: { name?: string; plan?: string }) {
    return apiFetch(`/tenants/${tenantId}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },

  // ─── Tags ─────────────────────────────────────────
  getTags(token: string) {
    return apiFetch<Tag[]>("/tags", { token });
  },
  createTag(token: string, data: { name: string; color?: string }) {
    return apiFetch<Tag>("/tags", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateTag(token: string, id: string, data: { name?: string; color?: string }) {
    return apiFetch<Tag>(`/tags/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteTag(token: string, id: string) {
    return apiFetch<void>(`/tags/${id}`, { token, method: "DELETE" });
  },
  getLeadTags(token: string, leadId: string) {
    return apiFetch<LeadTag[]>(`/tags/leads/${leadId}`, { token });
  },
  setLeadTags(token: string, leadId: string, tagIds: string[]) {
    return apiFetch<LeadTag[]>(`/tags/leads/${leadId}`, { token, method: "POST", body: JSON.stringify({ tagIds }) });
  },

  // ─── Custom Fields ────────────────────────────────
  getCustomFields(token: string) {
    return apiFetch<CustomFieldDefinition[]>("/custom-fields", { token });
  },
  createCustomField(token: string, data: Record<string, unknown>) {
    return apiFetch<CustomFieldDefinition>("/custom-fields", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateCustomField(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<CustomFieldDefinition>(`/custom-fields/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteCustomField(token: string, id: string) {
    return apiFetch<void>(`/custom-fields/${id}`, { token, method: "DELETE" });
  },
  getLeadCustomValues(token: string, leadId: string) {
    return apiFetch<CustomFieldValue[]>(`/custom-fields/leads/${leadId}`, { token });
  },
  setLeadCustomValues(token: string, leadId: string, values: { definitionId: string; value: string }[]) {
    return apiFetch<CustomFieldValue[]>(`/custom-fields/leads/${leadId}`, { token, method: "POST", body: JSON.stringify({ values }) });
  },

  // ─── Properties ───────────────────────────────────
  getProperties(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<PropertiesResponse>(`/properties${qs}`, { token });
  },
  getProperty(token: string, id: string) {
    return apiFetch<Property>(`/properties/${id}`, { token });
  },
  createProperty(token: string, data: Record<string, unknown>) {
    return apiFetch<Property>("/properties", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateProperty(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<Property>(`/properties/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteProperty(token: string, id: string) {
    return apiFetch<void>(`/properties/${id}`, { token, method: "DELETE" });
  },
  addPropertyMedia(token: string, propertyId: string, items: Array<{ url: string; kind?: string; thumbnailUrl?: string }>) {
    return apiFetch<PropertyMedia[]>(`/properties/${propertyId}/media`, { token, method: "POST", body: JSON.stringify({ items }) });
  },
  removePropertyMedia(token: string, mediaId: string) {
    return apiFetch<void>(`/properties/media/${mediaId}`, { token, method: "DELETE" });
  },
  async getInstagramImage(token: string, propertyId: string): Promise<Blob> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(`${API_URL}/api/properties/${propertyId}/instagram-image`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, string>;
        throw new ApiError(res.status, body.message ?? res.statusText, body);
      }
      return await res.blob();
    } finally {
      clearTimeout(timeout);
    }
  },

  // ─── Reel Video ───────────────────────────────────
  startReelVideo(token: string, propertyId: string, data: { agentName: string; agentPhone: string; musicUrl?: string }) {
    return apiFetch<{ jobId: string; status: string }>(`/reel-video/${propertyId}`, {
      token, method: "POST", body: JSON.stringify(data),
    });
  },
  getReelStatus(token: string, jobId: string) {
    return apiFetch<{ id: string; status: string; progress: number; propertyTitle: string; error: string | null }>(
      `/reel-video/${jobId}/status`, { token },
    );
  },
  getReelJobs(token: string) {
    return apiFetch<Array<{ id: string; propertyId: string; propertyTitle: string; status: string; progress: number; error: string | null; createdAt: number }>>(
      "/reel-video", { token },
    );
  },
  getReelDownloadUrl(jobId: string) {
    return `${API_URL}/api/reel-video/${jobId}/download`;
  },

  // ─── MercadoLibre ─────────────────────────────────
  getMeliConfigured(token: string) {
    return apiFetch<{ configured: boolean }>("/meli/configured", { token });
  },
  getMeliAuthUrl(token: string) {
    return apiFetch<{ url: string }>("/meli/auth-url", { token });
  },
  handleMeliCallback(token: string, code: string) {
    return apiFetch<{ ok: boolean }>(`/meli/callback?code=${encodeURIComponent(code)}`, { token });
  },
  getMeliStatus(token: string) {
    return apiFetch<MeliStatus>("/meli/status", { token });
  },
  getMeliItems(token: string) {
    return apiFetch<{ items: MeliItemPreview[]; total: number }>("/meli/items", { token });
  },
  syncMeli(token: string) {
    return apiFetch<MeliSyncResult>("/meli/sync", { token, method: "POST" });
  },
  disconnectMeli(token: string) {
    return apiFetch<{ ok: boolean }>("/meli", { token, method: "DELETE" });
  },
  assignMeliSeller(token: string, meliSellerId: string, agentId: string) {
    return apiFetch<{ ok: boolean; updated: number }>("/meli/assign-seller", {
      token,
      method: "POST",
      body: JSON.stringify({ meliSellerId, agentId }),
    });
  },

  // ─── Visits ───────────────────────────────────────
  async getVisits(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await apiFetch<{ data: Visit[]; total: number } | Visit[]>(`/visits${qs}`, { token });
    return Array.isArray(res) ? res : res.data;
  },
  getVisitStats(token: string) {
    return apiFetch<{ today: number; thisWeek: number; byStatus: Record<string, number> }>("/visits/stats", { token });
  },
  createVisit(token: string, data: Record<string, unknown>) {
    return apiFetch<Visit>("/visits", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateVisit(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<Visit>(`/visits/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteVisit(token: string, id: string) {
    return apiFetch<void>(`/visits/${id}`, { token, method: "DELETE" });
  },

  // ─── Agent Availability ──────────────────────────
  getMyAvailability(token: string) {
    return apiFetch<AgentAvailability[]>("/users/me/availability", { token });
  },
  getAgentAvailability(token: string, userId: string) {
    return apiFetch<AgentAvailability[]>(`/users/${userId}/availability`, { token });
  },
  setMyAvailability(token: string, slots: { dayOfWeek: number; startTime: string; endTime: string; active: boolean }[]) {
    return apiFetch<AgentAvailability[]>("/users/me/availability", {
      token, method: "PATCH", body: JSON.stringify({ slots }),
    });
  },
  getAvailableSlots(token: string, agentId: string, from: string, to: string) {
    return apiFetch<{ date: string; day: string; slots: string[] }[]>(
      `/users/${agentId}/available-slots?from=${from}&to=${to}`, { token },
    );
  },

  // ─── Calendar Sync (ICS + Google) ────────────────
  getCalendarToken(token: string) {
    return apiFetch<{ token: string | null }>("/calendar/token", { token });
  },
  generateCalendarToken(token: string) {
    return apiFetch<{ token: string }>("/calendar/token", { token, method: "POST" });
  },
  revokeCalendarToken(token: string) {
    return apiFetch<{ ok: boolean }>("/calendar/token", { token, method: "DELETE" });
  },
  getGoogleAuthUrl(token: string) {
    return apiFetch<{ url: string }>("/calendar/google/auth-url", { token });
  },
  connectGoogleCalendar(token: string, code: string) {
    return apiFetch<{ ok: boolean }>(`/calendar/google/callback?code=${encodeURIComponent(code)}`, { token });
  },
  getGoogleCalendarStatus(token: string) {
    return apiFetch<{ connected: boolean }>("/calendar/google/status", { token });
  },
  disconnectGoogleCalendar(token: string) {
    return apiFetch<{ ok: boolean }>("/calendar/google", { token, method: "DELETE" });
  },

  // ─── Follow-Up Sequences ─────────────────────────
  async getSequences(token: string) {
    const res = await apiFetch<{ data: FollowUpSequence[]; total: number } | FollowUpSequence[]>("/follow-ups", { token });
    return Array.isArray(res) ? res : res.data;
  },
  getSequence(token: string, id: string) {
    return apiFetch<FollowUpSequence & { runs: FollowUpRun[] }>(`/follow-ups/${id}`, { token });
  },
  createSequence(token: string, data: Record<string, unknown>) {
    return apiFetch<FollowUpSequence>("/follow-ups", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateSequence(token: string, id: string, data: Record<string, unknown>) {
    return apiFetch<FollowUpSequence>(`/follow-ups/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteSequence(token: string, id: string) {
    return apiFetch<void>(`/follow-ups/${id}`, { token, method: "DELETE" });
  },
  enrollLeadInSequence(token: string, sequenceId: string, leadId: string) {
    return apiFetch<FollowUpRun>(`/follow-ups/${sequenceId}/enroll/${leadId}`, { token, method: "POST" });
  },
  getActiveRuns(token: string) {
    return apiFetch<FollowUpRun[]>("/follow-ups/runs", { token });
  },
  cancelRun(token: string, runId: string) {
    return apiFetch<void>(`/follow-ups/runs/${runId}`, { token, method: "DELETE" });
  },

  // ─── Import ───────────────────────────────────────
  previewImport(token: string, csv: string) {
    return apiFetch<ImportPreview>("/import/preview", { token, method: "POST", body: JSON.stringify({ csv }) });
  },
  importLeads(token: string, csv: string, mapping?: Record<string, string>, sourceId?: string) {
    return apiFetch<ImportResult>("/import/leads", { token, method: "POST", body: JSON.stringify({ csv, mapping, sourceId }) });
  },

  // ─── Reports ──────────────────────────────────────
  getSummaryReport(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<SummaryReport>(`/reports/summary${qs}`, { token });
  },
  getLeadsReport(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Record<string, unknown>[]>(`/reports/leads${qs}`, { token });
  },
  getLeadsCSVUrl(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return `${API_URL}/api/reports/leads/csv${qs}`;
  },
  getPropertiesCSVUrl(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return `${API_URL}/api/reports/properties/csv${qs}`;
  },

  // ─── Lead Scoring ─────────────────────────────────
  recalculateAllScores(token: string) {
    return apiFetch<{ updated: number }>("/lead-scoring/recalculate", { token, method: "POST" });
  },
  getLeadScoringBreakdown(token: string, leadId: string) {
    return apiFetch<ScoringBreakdown>(`/lead-scoring/${leadId}/breakdown`, { token });
  },
  recalculateLeadScore(token: string, leadId: string) {
    return apiFetch<Lead>(`/lead-scoring/${leadId}`, { token, method: "POST" });
  },

  // ─── Agent Performance ────────────────────────────
  getTeamPerformance(token: string, month?: string) {
    const qs = month ? `?month=${month}` : "";
    return apiFetch<AgentMetrics[]>(`/agent-performance${qs}`, { token });
  },
  getLeaderboard(token: string, month?: string) {
    const qs = month ? `?month=${month}` : "";
    return apiFetch<Leaderboard>(`/agent-performance/leaderboard${qs}`, { token });
  },
  getAgentPerformance(token: string, userId: string, month?: string) {
    const qs = month ? `?month=${month}` : "";
    return apiFetch<AgentMetrics>(`/agent-performance/${userId}${qs}`, { token });
  },
  setAgentGoal(token: string, userId: string, data: { month: string; leadsTarget?: number; visitsTarget?: number; wonTarget?: number }) {
    return apiFetch(`/agent-performance/${userId}/goals`, { token, method: "POST", body: JSON.stringify(data) });
  },

  // ─── Notification Preferences ─────────────────────
  getNotificationPreferences(token: string) {
    return apiFetch<NotificationPreference>("/notifications/preferences", { token });
  },
  updateNotificationPreferences(token: string, data: { pushEnabled?: boolean; emailDigest?: string; pushSubscription?: unknown }) {
    return apiFetch<NotificationPreference>("/notifications/preferences", { token, method: "PATCH", body: JSON.stringify(data) });
  },

  // ─── Public Property (no auth) ────────────────────
  getPublicProperty(tenantId: string, slug: string) {
    return apiFetch<PublicProperty>(`/public/properties/${tenantId}/${slug}`);
  },
  submitPublicContact(tenantId: string, slug: string, data: { name: string; phone?: string; email?: string; message?: string }) {
    return apiFetch<{ ok: boolean; leadId: string }>(`/public/properties/${tenantId}/${slug}/contact`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getPropertyUrls(token: string, tenantId: string, slug: string) {
    return apiFetch<{ publicUrl: string; qrUrl: string }>(`/public/properties/${tenantId}/${slug}/urls`, { token });
  },

  // ─── WhatsApp Share ───────────────────────────────
  getWhatsAppShareLink(token: string, propertyId: string) {
    return apiFetch<WhatsAppShare>(`/properties/${propertyId}/share-whatsapp`, { token });
  },

  // ─── Commissions ─────────────────────────────────
  getCommissionRules(token: string) {
    return apiFetch<CommissionRule[]>("/commissions/rules", { token });
  },
  upsertCommissionRule(token: string, data: { operationType: string; percentage: number; splitAgentPct?: number; splitBizPct?: number; enabled?: boolean }) {
    return apiFetch<CommissionRule>("/commissions/rules", { token, method: "POST", body: JSON.stringify(data) });
  },
  deleteCommissionRule(token: string, id: string) {
    return apiFetch("/commissions/rules/" + id, { token, method: "DELETE" });
  },
  getCommissions(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<{ data: Commission[]; total: number }>(`/commissions${qs}`, { token });
  },
  getCommission(token: string, id: string) {
    return apiFetch<Commission>(`/commissions/${id}`, { token });
  },
  createCommission(token: string, data: { agentId: string; leadId?: string; propertyId?: string; operationType: string; dealAmount: number; commissionPct?: number; agentPct?: number; notes?: string }) {
    return apiFetch<Commission>("/commissions", { token, method: "POST", body: JSON.stringify(data) });
  },
  updateCommission(token: string, id: string, data: { status?: string; notes?: string; dealAmount?: number; commissionPct?: number; agentPct?: number }) {
    return apiFetch<Commission>(`/commissions/${id}`, { token, method: "PATCH", body: JSON.stringify(data) });
  },
  deleteCommission(token: string, id: string) {
    return apiFetch(`/commissions/${id}`, { token, method: "DELETE" });
  },
  getCommissionSummary(token: string, params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<CommissionSummary>(`/commissions/summary${qs}`, { token });
  },

  // ─── Lead Recovery ────────────────────────────────────
  fetchLeadRecovery(token: string, from: string, to: string) {
    const qs = new URLSearchParams({ from, to }).toString();
    return apiFetch<LeadRecoveryResult>(`/lead-recovery?${qs}`, { token, timeoutMs: 120_000 });
  },
  approveLeadRecovery(token: string, leadgenId: string) {
    return apiFetch<{ ok: boolean; leadId?: string }>(`/lead-recovery/${leadgenId}/approve`, { token, method: "POST" });
  },
  rejectLeadRecovery(token: string, leadgenId: string) {
    return apiFetch<{ ok: boolean }>(`/lead-recovery/${leadgenId}/reject`, { token, method: "POST" });
  },
};
