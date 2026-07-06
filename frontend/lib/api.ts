import { BOT_API_URL } from "./config";

export interface Me {
  teamId: string;
  userId: string;
  teamName: string | null;
}

export interface Team {
  id: string;
  name: string | null;
  installedAt: string;
  safeAddress: string | null;
  usdcAddress: string | null;
  wrapperAddress: string | null;
  botSignerAddress: string;
  treasuryConfigured: boolean;
}

export interface PayoutSummary {
  id: string;
  requesterId: string;
  recipientId: string;
  isPrivate: boolean;
  status: string;
  safeTxHash: string | null;
  txHash: string | null;
  createdAt: string;
}

export interface PayrollRunSummary {
  id: string;
  requesterId: string;
  isPrivate: boolean;
  status: string;
  safeTxHash: string | null;
  txHash: string | null;
  recipientCount: number;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message?: string,
  ) {
    super(message ?? `Zamance API request failed with status ${status}`);
  }
}

async function parseErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error;
  } catch {
    return undefined;
  }
}

async function get<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BOT_API_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));
  return res.json() as Promise<T>;
}

async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BOT_API_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));
  return res.json() as Promise<T>;
}

export const api = {
  me: (token: string) => get<Me>("/api/me", token),
  team: (token: string) => get<Team>("/api/team", token),
  payouts: (token: string) => get<PayoutSummary[]>("/api/payouts", token),
  payrollRuns: (token: string) => get<PayrollRunSummary[]>("/api/payroll-runs", token),
  connectTreasury: (token: string, safeAddress: string) =>
    post<{ safeAddress: string }>("/api/team/treasury", token, { safeAddress }),
  fundTreasury: (token: string, amount: string) => post<{ safeTxHash: string }>("/api/team/fund", token, { amount }),
};
