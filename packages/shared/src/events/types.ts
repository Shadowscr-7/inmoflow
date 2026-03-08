export type BaseEvent<T extends string, P> = {
  id: string;
  topic: T;
  tenantId: string;
  occurredAt: string; // ISO 8601
  correlationId?: string;
  payload: P;
};

export type LeadCreatedPayload = {
  leadId: string;
  sourceType:
    | "WEB_FORM"
    | "META_LEAD_AD"
    | "WHATSAPP_INBOUND"
    | "TELEGRAM_INBOUND"
    | "MANUAL";
};

export type LeadAssignedPayload = {
  leadId: string;
  assigneeId: string;
  previousAssigneeId?: string | null;
};

export type LeadContactedPayload = {
  leadId: string;
  messageId: string;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
};

export type MessageInboundPayload = {
  leadId: string;
  messageId: string;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
  from?: string;
  content: string;
};

export type MessageSendRequestedPayload = {
  leadId: string;
  channel: "WHATSAPP" | "TELEGRAM";
  templateKey?: string;
  text?: string;
  variables?: Record<string, string | number | boolean>;
};

export type ChannelConnectedPayload = {
  channelId: string;
  type: "WHATSAPP" | "TELEGRAM" | "META" | "WEB";
};

export type WorkflowExecutePayload = {
  trigger: "lead.created" | "message.inbound" | string;
  leadId: string;
  messageId?: string;
};

export type ProviderErrorPayload = {
  provider: "EVOLUTION" | "TELEGRAM" | "META";
  detail: string;
  context?: Record<string, unknown>;
};

// ─── Typed event aliases ──────────────────────────────
export type LeadCreatedEvent = BaseEvent<"lead.created", LeadCreatedPayload>;
export type LeadAssignedEvent = BaseEvent<"lead.assigned", LeadAssignedPayload>;
export type LeadContactedEvent = BaseEvent<"lead.contacted", LeadContactedPayload>;
export type MessageInboundEvent = BaseEvent<"message.inbound", MessageInboundPayload>;
export type MessageSendRequestedEvent = BaseEvent<"message.send_requested", MessageSendRequestedPayload>;
export type ChannelConnectedEvent = BaseEvent<"channel.connected", ChannelConnectedPayload>;
export type WorkflowExecuteEvent = BaseEvent<"workflow.execute", WorkflowExecutePayload>;
export type ProviderErrorEvent = BaseEvent<"provider.error", ProviderErrorPayload>;
