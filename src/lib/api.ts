import { ChitFund, Member, DrawResult, CreateChitPayload, AddMemberPayload, Payment } from '@/types/chit';
import { supabase } from './supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const FASTAPI_TIMEOUT_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FASTAPI_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

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

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase!.auth.getSession();
    return session?.user?.id ?? null;
  } catch (_) {
    return null;
  }
}

// ─── Mappers (snake_case backend ↔ camelCase frontend) ────────────────────────

function mapMember(raw: Record<string, unknown>): Member {
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

function mapDraw(raw: Record<string, unknown>): DrawResult {
  return {
    id: raw.id as string,
    month: raw.month as number,
    winnerId: (raw.winner_id ?? raw.winnerId) as string,
    winnerName: (raw.winner_name ?? raw.winnerName) as string,
    drawnAt: (raw.drawn_at ?? raw.drawnAt) as string,
  };
}

function mapPayment(raw: Record<string, unknown>): Payment {
  return {
    id: raw.id as string,
    member_id: raw.member_id as string,
    month: raw.month as number,
    amount: raw.amount as number,
    is_paid: raw.is_paid as boolean,
    paid_at: raw.paid_at as string | null,
    marked_by: raw.marked_by as string | null,
  };
}

function mapChit(raw: Record<string, unknown>): ChitFund {
  const members = Array.isArray(raw.members)
    ? (raw.members as Record<string, unknown>[]).map(mapMember)
    : [];
  const draws = Array.isArray(raw.draws)
    ? (raw.draws as Record<string, unknown>[]).map(mapDraw)
    : [];
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
    members,
    draws,
  };
}

// ─── FastAPI client (Tier 1) ──────────────────────────────────────────────────

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

// ─── Supabase direct queries (Tier 2) ─────────────────────────────────────────

async function supabaseGetChits(): Promise<ChitFund[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const { data: chits, error: chitError } = await supabase
    .from('chit_funds')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (chitError) throw chitError;
  if (!chits || chits.length === 0) return [];

  const chitIds = (chits as Record<string, unknown>[]).map(c => c.id as string);

  const { data: members, error: memberError } = await supabase
    .from('members')
    .select('*')
    .in('chit_fund_id', chitIds);
  if (memberError) throw memberError;

  const { data: draws, error: drawError } = await supabase
    .from('draw_results')
    .select('*')
    .in('chit_fund_id', chitIds);
  if (drawError) throw drawError;

  return (chits as Record<string, unknown>[]).map(chit => mapChit({
    ...chit,
    members: (members as Record<string, unknown>[] || []).filter(m => m.chit_fund_id === chit.id),
    draws: (draws as Record<string, unknown>[] || []).filter(d => d.chit_fund_id === chit.id),
  }));
}

async function supabaseGetChit(id: string): Promise<ChitFund | null> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: chit, error } = await supabase
    .from('chit_funds')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('chit_fund_id', id);

  const { data: draws } = await supabase
    .from('draw_results')
    .select('*')
    .eq('chit_fund_id', id);

  return mapChit({
    ...(chit as Record<string, unknown>),
    members: members || [],
    draws: draws || [],
  });
}

async function supabaseCreateChit(payload: CreateChitPayload): Promise<ChitFund> {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const chitId = generateId();
  const organizerId = generateId();

  const { error: chitError } = await supabase.from('chit_funds').insert({
    id: chitId,
    name: payload.name,
    description: payload.description,
    monthly_amount: payload.monthlyAmount,
    currency: payload.currency,
    total_members: payload.totalMembers,
    duration_months: payload.durationMonths,
    organizer_id: organizerId,   // just a text field, no FK constraint
    organizer_upi: payload.organizerUpi,
    organizer_wins_first: payload.organizerWinsFirst,
    status: 'draft',
    current_month: 0,
    user_id: userId,
  });
  if (chitError) throw new Error(`Chit insert failed: ${chitError.message}`);

  // Now insert member — chit exists so FK on chit_fund_id is satisfied
  const { error: memberError } = await supabase.from('members').insert({
    id: organizerId,
    chit_fund_id: chitId,
    name: payload.organizerName,
    email: payload.organizerEmail,
    country: payload.organizerCountry,
    has_won: false,
    user_id: userId,
  });
  if (memberError) {
    // Rollback chit
    await supabase.from('chit_funds').delete().eq('id', chitId);
    throw new Error(`Member insert failed: ${memberError.message}`);
  }

  return (await supabaseGetChit(chitId))!;
}

async function supabaseAddMember(chitId: string, payload: AddMemberPayload): Promise<Member> {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await getCurrentUserId();

  const chit = await supabaseGetChit(chitId);
  if (!chit) throw new Error('Chit not found');
  if (chit.status !== 'draft') throw new Error('Cannot add members to an active chit');
  if (chit.members.length >= chit.totalMembers) throw new Error('Maximum members reached');

  const memberId = generateId();
  const { error } = await supabase.from('members').insert({
    id: memberId,
    chit_fund_id: chitId,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    country: payload.country,
    has_won: false,
    user_id: userId,
  });
  if (error) throw error;

  const newCount = chit.members.length + 1;
  if (newCount >= chit.totalMembers) {
    await supabase
      .from('chit_funds')
      .update({ status: 'active', current_month: 1 })
      .eq('id', chitId);
  }

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .single();

  return mapMember(member as Record<string, unknown>);
}

async function supabaseRemoveMember(chitId: string, memberId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const chit = await supabaseGetChit(chitId);
  if (!chit) throw new Error('Chit not found');
  if (chit.status !== 'draft') throw new Error('Cannot remove members from an active chit');
  if (memberId === chit.organizerId) throw new Error('Cannot remove organizer');

  const { error } = await supabase.from('members').delete().eq('id', memberId);
  if (error) throw error;
}

async function supabaseConductDraw(chitId: string): Promise<DrawResult> {
  if (!supabase) throw new Error('Supabase not configured');

  const chit = await supabaseGetChit(chitId);
  if (!chit) throw new Error('Chit not found');
  if (chit.status !== 'active') throw new Error('Chit is not active');
  if (chit.currentMonth! > chit.durationMonths) throw new Error('All draws completed');

  const eligible = chit.members.filter(m => !m.hasWon);
  const organizer = chit.members.find(m => m.id === chit.organizerId)!;
  const isFirst = chit.currentMonth === 1;
  const isLast = chit.currentMonth === chit.durationMonths;

  let winner: Member;
  if (chit.organizerWinsFirst && isFirst && !organizer.hasWon) {
    winner = organizer;
  } else if (!chit.organizerWinsFirst && isLast && !organizer.hasWon) {
    winner = organizer;
  } else if (!chit.organizerWinsFirst && eligible.length === 1) {
    winner = eligible[0];
  } else {
    let pool = eligible;
    if (!chit.organizerWinsFirst && !organizer.hasWon) {
      pool = eligible.filter(m => m.id !== chit.organizerId);
    }
    winner = pool.length ? pool[Math.floor(Math.random() * pool.length)] : eligible[0];
  }

  await supabase.from('members').update({
    has_won: true,
    won_in_month: chit.currentMonth,
  }).eq('id', winner.id);

  const drawId = generateId();
  const newMonth = chit.currentMonth! + 1;
  const newStatus = newMonth > chit.durationMonths ? 'completed' : 'active';

  await supabase.from('draw_results').insert({
    id: drawId,
    chit_fund_id: chitId,
    month: chit.currentMonth,
    winner_id: winner.id,
    winner_name: winner.name,
  });

  await supabase.from('chit_funds').update({
    current_month: newMonth,
    status: newStatus,
  }).eq('id', chitId);

  const { data: draw } = await supabase
    .from('draw_results')
    .select('*')
    .eq('id', drawId)
    .single();

  return mapDraw(draw as Record<string, unknown>);
}

// ─── Main API (2-tier: FastAPI → Supabase) ────────────────────────────────────

export const api = {

  async getChits(): Promise<ChitFund[]> {
    try {
      const data = await apiFetch<Record<string, unknown>[]>('/api/chits');
      return data.map(mapChit);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      return supabaseGetChits();
    }
  },

  async getChit(id: string): Promise<ChitFund | null> {
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/chits/${id}`);
      return mapChit(data);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      return supabaseGetChit(id);
    }
  },

  async createChit(payload: CreateChitPayload): Promise<ChitFund> {
    try {
      const body = {
        name: payload.name,
        description: payload.description,
        monthly_amount: payload.monthlyAmount,
        currency: payload.currency,
        total_members: payload.totalMembers,
        duration_months: payload.durationMonths,
        organizer_name: payload.organizerName,
        organizer_email: payload.organizerEmail,
        organizer_country: payload.organizerCountry,
        organizer_wins_first: payload.organizerWinsFirst,
        organizer_upi: payload.organizerUpi,
      };
      const data = await apiFetch<Record<string, unknown>>('/api/chits', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return mapChit(data);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      return supabaseCreateChit(payload);
    }
  },

  async getPayments(chitId: string): Promise<Payment[]> {
    try {
      const data = await apiFetch<Record<string, unknown>[]>(`/api/chits/${chitId}/payments`);
      return data.map(mapPayment);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('chit_fund_id', chitId);
      if (error) throw error;
      return (data as Record<string, unknown>[]).map(mapPayment);
    }
  },

  async markPaid(chitId: string, paymentId: string): Promise<Payment> {
    try {
      const data = await apiFetch<Record<string, unknown>>(
        `/api/chits/${chitId}/payments/${paymentId}/mark-paid`,
        { method: 'PATCH' }
      );
      return mapPayment(data);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('payments')
        .update({ is_paid: true, paid_at: new Date().toISOString(), marked_by: 'organizer' })
        .eq('id', paymentId)
        .select()
        .single();
      if (error) throw error;
      return mapPayment(data as Record<string, unknown>);
    }
  },

  async markUnpaid(chitId: string, paymentId: string): Promise<Payment> {
    try {
      const data = await apiFetch<Record<string, unknown>>(
        `/api/chits/${chitId}/payments/${paymentId}/mark-unpaid`,
        { method: 'PATCH' }
      );
      return mapPayment(data);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('payments')
        .update({ is_paid: false, paid_at: null, marked_by: null })
        .eq('id', paymentId)
        .select()
        .single();
      if (error) throw error;
      return mapPayment(data as Record<string, unknown>);
    }
  },

  async addMember(chitId: string, payload: AddMemberPayload): Promise<Member> {
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/chits/${chitId}/members`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return mapMember(data);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      return supabaseAddMember(chitId, payload);
    }
  },

  async removeMember(chitId: string, memberId: string): Promise<void> {
    try {
      await apiFetch(`/api/chits/${chitId}/members/${memberId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      return supabaseRemoveMember(chitId, memberId);
    }
  },

  async conductDraw(chitId: string): Promise<DrawResult> {
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/chits/${chitId}/draw`, {
        method: 'POST',
      });
      return mapDraw(data);
    } catch (e) {
      console.warn('FastAPI unavailable, using Supabase:', e);
      return supabaseConductDraw(chitId);
    }
  },

  async getEligibleMembers(chitId: string): Promise<Member[]> {
    const chit = await this.getChit(chitId);
    if (!chit) return [];
    let eligible = chit.members.filter(m => !m.hasWon);
    if (!chit.organizerWinsFirst && chit.currentMonth! < chit.durationMonths) {
      eligible = eligible.filter(m => m.id !== chit.organizerId);
    }
    return eligible;
  },
};
