// ─── REPLACE these two functions in your api.ts ───────────────────────────────

// 1. Add this new function after the FASTAPI_TIMEOUT_MS line:
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase!.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (_) {}
  return headers;
}

// 2. Replace the existing apiFetch function with this:
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    headers: authHeaders,
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

// NOTE: For POST/DELETE requests that send body, headers are merged correctly
// because options.headers would override Content-Type if needed.
// The auth token is always included automatically.