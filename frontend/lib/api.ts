/**
 * lib/api.ts
 * Typed API client — all request go to NEXT_PUBLIC_API_URL (default: http://localhost:8000)
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://manglamx-cve-reranker.hf.space";

export interface CVEResult {
  cve_id: string;
  description: string;
  cvss_score: number;
  cvss_label: string;
  predicted_label: string;
  prob_critical: number;
  context_score: number;
  boost_factor: number;
  matched_inventory: string[];
  attack_vector: string;
  has_remote: number;
  has_exec: number;
}

export interface BulkResponse {
  analysed: number;
  missing: string[];
  results: CVEResult[];
}

export interface InventoryMatchResponse {
  matched: number;
  results: CVEResult[];
}

export interface StatsResponse {
  total_cves: number;
  label_distribution: Record<string, number>;
  classes: string[];
  feature_dims: number;
  trained_on_rows: number | string;
  last_data_update: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string; model: string }>("/health"),

  stats: () => request<StatsResponse>("/stats"),

  getCVE: (cveId: string, inventory: string[] = []) => {
    const params = new URLSearchParams();
    inventory.forEach((item) => params.append("inventory", item));
    const qs = params.toString() ? `?${params}` : "";
    return request<CVEResult>(`/cve/${encodeURIComponent(cveId.toUpperCase())}${qs}`);
  },

  bulkAnalyse: (cve_ids: string[], inventory: string[] = []) =>
    request<BulkResponse>("/bulk", {
      method: "POST",
      body: JSON.stringify({ cve_ids, inventory }),
    }),

  inventoryMatch: (file: File, sample_size = 5000): Promise<InventoryMatchResponse> => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/inventory?sample_size=${sample_size}`, {
      method: "POST",
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      return res.json();
    });
  },
};
