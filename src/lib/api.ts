import {
  ChitFund,
  Member,
  DrawResult,
  Payment,
  PendingMembership,
  CreateChitPayload,
  AddMemberPayload,
} from '@/types/chit';
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const FASTAPI_TIMEOUT_MS = 20000;
type Raw = Record<string, unknown>;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FASTAPI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) throw new Error('Supabase authentication is not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('You must be signed in');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

function mapMember(raw: Raw): Member {
  return {
    id: raw.id as string,
    name: raw.name as string,
    email: raw.email as string,
    phone: raw.phone as string | undefined,
    country: raw.country as string,
    hasWon: (raw.has_won ?? raw.hasWon) as boolean,
    wonInMonth: (raw.won_in_month ?? raw.wonInMonth) as number | undefined,
  };
}

function mapDraw(raw: Raw): DrawResult {
  return {
    id: raw.id as string,
    month: raw.month as number,
    winnerId: (raw.winner_id ?? raw.winnerId) as string,
    winnerName: (raw.winner_name ?? raw.winnerName) as string,
    drawnAt: (raw.drawn_at ?? raw.drawnAt) as string,
  };
}

function mapChit(raw: Raw): ChitFund {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string | undefined,
    monthlyAmount: (raw.monthly_amount ?? raw.monthlyAmount) as number,
    currency: raw.currency as string,
    totalMembers: (raw.total_members ?? raw.totalMembers) as number,
    durationMonths: (raw.duration_months ?? raw.durationMonths) as number,
    currentMonth: (raw.current_month ?? raw.currentMonth) as number,
    organizerId: (raw.organizer_id ?? raw.organizerId) as string,
    organizerWinsFirst: (raw.organizer_wins_first ?? raw.organizerWinsFirst) as boolean,
    organizerUpi: (raw.organizer_upi ?? raw.organizerUpi) as string | undefined,
    status: raw.status as 'draft' | 'active' | 'completed',
    createdAt: (raw.created_at ?? raw.createdAt) as string,
    members: Array.isArray(raw.members) ? raw.members.map((m) => mapMember(m as Raw)) : [],
    draws: Array.isArray(raw.draws) ? raw.draws.map((d) => mapDraw(d as Raw)) : [],
  };
}

function mapPendingMembership(raw: Raw): PendingMembership {
  return {
    memberId: raw.member_id as string,
    chitId: raw.chit_id as string,
    chitName: raw.chit_name as string,
    memberName: raw.member_name as string,
    email: raw.email as string,
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeaders, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Supabase is used only for Auth/JWT retrieval; application data stays behind FastAPI. */
export interface PublicInvitePreview {
  id: string;
  name: string;
  description?: string;
  monthlyAmount: number;
  currency: string;
  totalMembers: number;
  durationMonths: number;
  memberCount: number;
  organizerName?: string;
  organizerWinsFirst: boolean;
  status: 'draft' | 'active' | 'completed';
}

function mapPublicInvite(raw: Raw): PublicInvitePreview {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string | undefined,
    monthlyAmount: (raw.monthly_amount ?? raw.monthlyAmount) as number,
    currency: raw.currency as string,
    totalMembers: (raw.total_members ?? raw.totalMembers) as number,
    durationMonths: (raw.duration_months ?? raw.durationMonths) as number,
    memberCount: (raw.member_count ?? raw.memberCount) as number,
    organizerName: (raw.organizer_name ?? raw.organizerName) as string | undefined,
    organizerWinsFirst: (raw.organizer_wins_first ?? raw.organizerWinsFirst) as boolean,
    status: raw.status as 'draft' | 'active' | 'completed',
  };
}

async function getPublicInvite(id: string): Promise<PublicInvitePreview | null> {
  const res = await fetchWithTimeout(API_BASE_URL + '/api/invites/' + id);
  if (res.status === 404) return null;
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API request failed (${res.status})`);
  }
  return mapPublicInvite(await res.json());
}

export const api = {
  async getPublicInvite(id: string): Promise<PublicInvitePreview | null> {
    return getPublicInvite(id);
  },

  async getChits(): Promise<ChitFund[]> {
    const data = await apiFetch<Raw[]>('/api/chits');
    return data.map(mapChit);
  },

  async getChit(id: string): Promise<ChitFund | null> {
    try {
      return mapChit(await apiFetch<Raw>(`/api/chits/${id}`));
    } catch (error) {
      if (error instanceof Error && error.message === 'Chit fund not found') return null;
      throw error;
    }
  },

  async getPendingMemberships(): Promise<PendingMembership[]> {
    const data = await apiFetch<Raw[]>('/api/memberships/pending');
    return data.map(mapPendingMembership);
  },

  async claimMembership(memberId: string): Promise<PendingMembership> {
    return mapPendingMembership(await apiFetch<Raw>(`/api/memberships/${memberId}/claim`, {
      method: 'POST',
    }));
  },

  async createChit(payload: CreateChitPayload): Promise<ChitFund> {
    const data = await apiFetch<Raw>('/api/chits', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        monthly_amount: payload.monthlyAmount,
        currency: payload.currency,
        total_members: payload.totalMembers,
        organizer_name: payload.organizerName,
        organizer_email: payload.organizerEmail,
        organizer_country: payload.organizerCountry,
        organizer_wins_first: payload.organizerWinsFirst,
        organizer_upi: payload.organizerUpi,
      }),
    });
    return mapChit(data);
  },

  async addMember(chitId: string, payload: AddMemberPayload): Promise<Member> {
    return mapMember(await apiFetch<Raw>(`/api/chits/${chitId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  },

  async removeMember(chitId: string, memberId: string): Promise<void> {
    await apiFetch(`/api/chits/${chitId}/members/${memberId}`, { method: 'DELETE' });
  },

  async getEligibleMembers(chitId: string): Promise<Member[]> {
    const data = await apiFetch<Raw[]>(`/api/chits/${chitId}/eligible`);
    return data.map(mapMember);
  },

  async conductDraw(chitId: string, expectedMonth: number): Promise<DrawResult> {
    return mapDraw(await apiFetch<Raw>(`/api/chits/${chitId}/draw`, {
      method: 'POST',
      body: JSON.stringify({ expected_month: expectedMonth }),
    }));
  },

  async getPayments(chitId: string): Promise<Payment[]> {
    return apiFetch<Payment[]>(`/api/chits/${chitId}/payments`);
  },

  async markPaid(chitId: string, paymentId: string): Promise<Payment> {
    return apiFetch<Payment>(`/api/chits/${chitId}/payments/${paymentId}/mark-paid`, { method: 'PATCH' });
  },

  async markUnpaid(chitId: string, paymentId: string): Promise<Payment> {
    return apiFetch<Payment>(`/api/chits/${chitId}/payments/${paymentId}/mark-unpaid`, { method: 'PATCH' });
  },
};
