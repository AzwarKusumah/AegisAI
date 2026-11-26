export type SecurityEvent = {
  event_id: string;
  occurred_at: string;
  actor: { user_id?: string | null; username: string; identity_source: string };
  device: { device_id: string; hostname: string; os: string };
  provider: string;
  provider_domain: string;
  event_type: string;
  file: { name: string; extension: string; mime_type: string; size_bytes: number };
  inspection: { status: string; risk_score: number; severity: string; categories: string[] };
  outcome: string;
  enforcement: { confirmed: boolean; component: string };
  policy_id?: string;
  policy_name?: string;
  policy_action?: "block" | "audit" | "allow" | string;
  redacted_preview?: string;
};

export type ManagedDevice = {
  device_id: string;
  hostname: string;
  os: string;
  username: string;
  status: "active" | "revoked" | string;
  enrolled_at: string;
  last_seen_at: string | null;
};

export type PolicyException = {
  name: string;
  categories: string[];
  providers: string[];
  extensions: string[];
};

export type DlpPolicy = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  action: "block" | "audit" | "allow";
  min_severity: "none" | "low" | "medium" | "high" | "critical" | string;
  min_risk_score: number;
  categories: string[];
  providers: string[];
  extensions: string[];
  exceptions: PolicyException[];
  share_redacted_preview: boolean;
  updated_at?: string;
};
