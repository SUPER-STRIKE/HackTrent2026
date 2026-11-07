export type DemoRow = {
  time: Date;
  agent: number;
  session: string;
  type: string;
  target: string;
  payload: Record<string, unknown>;
  score: number;
  reason: string;
  status: "allowed" | "pending" | "approved" | "denied";
  by: string | null;
};

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export const AGENTS: [string, string][];
export function historyRows(now?: number): DemoRow[];
export function liveRow(seq: number, time: Date): DemoRow;
export function insertAgents(client: Queryable): Promise<void>;
export function insertRow(client: Queryable, row: DemoRow): Promise<void>;
