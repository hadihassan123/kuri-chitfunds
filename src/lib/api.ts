import { ChitFund, Member, DrawResult, CreateChitPayload, AddMemberPayload } from '@/types/chit';
import { supabase } from './supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const STORAGE_KEY = 'chitfunds_data';
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

/** Get auth headers with Supabase JWT token */
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

/** Get current logged-in user ID */
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
    status: raw.status as 'draft' | 'active' | 'completed',
    createdAt: (raw.created_at ?? raw.createdAt) as string,
    members,
    draws,
  };
}

// ─── localStorage (Tier 3 — offline only) ─────────────────────────────────────

function getStoredChits(): ChitFund[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveChits(chits: ChitFund[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chits));
}

function syncToLocal(chits: ChitFund[]): void {
  saveChits(chits);
}

// ─── Supabase direct queries (Tier 2) ─────────────────────────────────────────

async function supabaseGetChits(): Promise<ChitFund[]> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: chits, error: chitError } = await supabase
    .from('chit_funds')
    .select('*')
    .order('created_at', { ascending: false });

  if (chitError) throw chitError;

  const { data: members, error: memberError } = await supabase
    .from('members')
    .select('*');

  if (memberError) throw memberError;

  const { data: draws, error: drawError } = await supabase
    .from('draw_results')
    .select('*');

  if (drawError) throw drawError;

  return (chits as Record<string, unknown>[]).map(chit => mapChit({
    ...chit,
    members: (members as Record<string, unknown>[]).filter(m => m.chit_fund_id === chit.id),
    draws: (draws as Record<string, unknown>[]).filter(d => d.chit_fund_id === chit.id),
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
    organizer_id: organizerId,
    organizer_wins_first: payload.organizerWinsFirst,
    status: 'draft',
    current_month: 0,
    user_id: userId,  // ← link to logged-in user
  });
  if (chitError) throw chitError;

  const { error: memberError } = await supabase.from('members').insert({
    id: organizerId,
    chit_fund_id: chitId,
    name: payload.organizerName,
    email: payload.organizerEmail,
    country: payload.organizerCountry,
    has_won: false,
    user_id: userId,  // ← organizer is also a member
  });
  if (memberError) throw memberError;

  return (await supabaseGetChit(chitId))!;
}

async function supabaseAddMember(chitId: string, payload: AddMemberPayload): Promise<Member> {
  if (!supabase) throw new Error('Supabase not configured');

  const userId = await getCurrentUserId(); // null if not logged in

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
    user_id: userId,  // ← null if joined without account
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
  if (chit.currentMonth > chit.durationMonths) throw new Error('All draws completed');

  let eligible = chit.members.filter(m => !m.hasWon);
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
  const newMonth = chit.currentMonth + 1;
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

// ─── FastAPI helpers (Tier 1) ─────────────────────────────────────────────────

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

// ─── Main API (3-tier fallback) ───────────────────────────────────────────────

export const api = {

  async getChits(): Promise<ChitFund[]> {
    // Tier 1: FastAPI
    try {
      const data = await apiFetch<Record<string, unknown>[]>('/api/chits');
      const chits = data.map(mapChit);
      syncToLocal(chits);
      return chits;
    } catch (e) {
      console.warn('FastAPI unavailable, trying Supabase:', e);
    }
    // Tier 2: Supabase
    try {
      const chits = await supabaseGetChits();
      syncToLocal(chits);
      return chits;
    } catch (e) {
      console.warn('Supabase unavailable, using localStorage:', e);
    }
    // Tier 3: localStorage
    return getStoredChits();
  },

  async getChit(id: string): Promise<ChitFund | null> {
    // Tier 1: FastAPI
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/chits/${id}`);
      return mapChit(data);
    } catch (e) {
      console.warn('FastAPI unavailable, trying Supabase:', e);
    }
    // Tier 2: Supabase
    try {
      return await supabaseGetChit(id);
    } catch (e) {
      console.warn('Supabase unavailable, using localStorage:', e);
    }
    // Tier 3: localStorage
    return getStoredChits().find(c => c.id === id) || null;
  },

  async createChit(payload: CreateChitPayload): Promise<ChitFund> {
    // Tier 1: FastAPI
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
      };
      const data = await apiFetch<Record<string, unknown>>('/api/chits', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return mapChit(data);
    } catch (e) {
      console.warn('FastAPI unavailable, trying Supabase:', e);
    }
    // Tier 2: Supabase
    try {
      return await supabaseCreateChit(payload);
    } catch (e) {
      console.warn('Supabase unavailable, using localStorage:', e);
    }
    // Tier 3: localStorage
    const organizerId = generateId();
    const newChit: ChitFund = {
      id: generateId(),
      name: payload.name,
      description: payload.description,
      monthlyAmount: payload.monthlyAmount,
      currency: payload.currency,
      totalMembers: payload.totalMembers,
      durationMonths: payload.durationMonths,
      currentMonth: 0,
      organizerId,
      organizerWinsFirst: payload.organizerWinsFirst,
      members: [{
        id: organizerId,
        name: payload.organizerName,
        email: payload.organizerEmail,
        country: payload.organizerCountry,
        hasWon: false,
      }],
      draws: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    const chits = getStoredChits();
    chits.push(newChit);
    saveChits(chits);
    return newChit;
  },

  async addMember(chitId: string, payload: AddMemberPayload): Promise<Member> {
    // Tier 1: FastAPI
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/chits/${chitId}/members`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return mapMember(data);
    } catch (e) {
      console.warn('FastAPI unavailable, trying Supabase:', e);
    }
    // Tier 2: Supabase
    try {
      return await supabaseAddMember(chitId, payload);
    } catch (e) {
      console.warn('Supabase unavailable, using localStorage:', e);
    }
    // Tier 3: localStorage
    const chits = getStoredChits();
    const chit = chits.find(c => c.id === chitId);
    if (!chit) throw new Error('Chit not found');
    if (chit.members.length >= chit.totalMembers) throw new Error('Maximum members reached');
    const newMember: Member = { id: generateId(), ...payload, hasWon: false };
    chit.members.push(newMember);
    if (chit.members.length === chit.totalMembers) {
      chit.status = 'active';
      chit.currentMonth = 1;
    }
    saveChits(chits);
    return newMember;
  },

  async removeMember(chitId: string, memberId: string): Promise<void> {
    // Tier 1: FastAPI
    try {
      await apiFetch(`/api/chits/${chitId}/members/${memberId}`, { method: 'DELETE' });
      return;
    } catch (e) {
      console.warn('FastAPI unavailable, trying Supabase:', e);
    }
    // Tier 2: Supabase
    try {
      await supabaseRemoveMember(chitId, memberId);
      return;
    } catch (e) {
      console.warn('Supabase unavailable, using localStorage:', e);
    }
    // Tier 3: localStorage
    const chits = getStoredChits();
    const chit = chits.find(c => c.id === chitId);
    if (!chit) throw new Error('Chit not found');
    if (chit.status !== 'draft') throw new Error('Cannot remove members from active chit');
    if (memberId === chit.organizerId) throw new Error('Cannot remove organizer');
    chit.members = chit.members.filter(m => m.id !== memberId);
    saveChits(chits);
  },

  async conductDraw(chitId: string): Promise<DrawResult> {
    // Tier 1: FastAPI
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/chits/${chitId}/draw`, {
        method: 'POST',
      });
      return mapDraw(data);
    } catch (e) {
      console.warn('FastAPI unavailable, trying Supabase:', e);
    }
    // Tier 2: Supabase
    try {
      return await supabaseConductDraw(chitId);
    } catch (e) {
      console.warn('Supabase unavailable, using localStorage:', e);
    }
    // Tier 3: localStorage
    const chits = getStoredChits();
    const chit = chits.find(c => c.id === chitId);
    if (!chit) throw new Error('Chit not found');
    if (chit.status !== 'active') throw new Error('Chit is not active');
    if (chit.currentMonth > chit.durationMonths) throw new Error('All draws completed');
    let eligible = chit.members.filter(m => !m.hasWon);
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
      winner = pool[Math.floor(Math.random() * pool.length)];
    }
    const idx = chit.members.findIndex(m => m.id === winner.id);
    chit.members[idx].hasWon = true;
    chit.members[idx].wonInMonth = chit.currentMonth;
    const draw: DrawResult = {
      id: generateId(),
      month: chit.currentMonth,
      winnerId: winner.id,
      winnerName: winner.name,
      drawnAt: new Date().toISOString(),
    };
    chit.draws.push(draw);
    chit.currentMonth++;
    if (chit.currentMonth > chit.durationMonths) chit.status = 'completed';
    saveChits(chits);
    return draw;
  },

  async getEligibleMembers(chitId: string): Promise<Member[]> {
    const chit = await this.getChit(chitId);
    if (!chit) return [];
    let eligible = chit.members.filter(m => !m.hasWon);
    if (!chit.organizerWinsFirst && chit.currentMonth < chit.durationMonths) {
      eligible = eligible.filter(m => m.id !== chit.organizerId);
    }
    return eligible;
  },
};
