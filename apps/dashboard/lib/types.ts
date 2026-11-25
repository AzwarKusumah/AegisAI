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
};
