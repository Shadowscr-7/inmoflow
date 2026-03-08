export const Topics = {
  LEAD_CREATED: "lead.created",
  LEAD_UPDATED: "lead.updated",
  LEAD_ASSIGNED: "lead.assigned",
  LEAD_CONTACTED: "lead.contacted",
  MESSAGE_INBOUND: "message.inbound",
  MESSAGE_SEND_REQUESTED: "message.send_requested",
  MESSAGE_SENT: "message.sent",
  CHANNEL_CONNECTED: "channel.connected",
  CHANNEL_DISCONNECTED: "channel.disconnected",
  WORKFLOW_EXECUTE: "workflow.execute",
  WORKFLOW_EXECUTED: "workflow.executed",
  WORKFLOW_FAILED: "workflow.failed",
  PROVIDER_ERROR: "provider.error",
} as const;

export type Topic = (typeof Topics)[keyof typeof Topics];
