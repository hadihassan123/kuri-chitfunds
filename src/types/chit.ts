export interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  country: string;
  hasWon: boolean;
  wonInMonth?: number;
}

export interface PendingMembership {
  memberId: string;
  chitId: string;
  chitName: string;
  memberName: string;
  email: string;
}

export interface DrawResult {
  id: string;
  month: number;
  winnerId: string;
  winnerName: string;
  drawnAt: string;
}

export interface Payment {
  id: string;
  member_id: string;
  month: number;
  amount: number;
  is_paid: boolean;
  paid_at?: string;
  marked_by?: string;
}

export interface ChitFund {
  id: string;
  name: string;
  description?: string;
  monthlyAmount: number;
  currency: string;
  totalMembers: number;
  durationMonths: number;
  currentMonth: number;
  organizerId: string;
  organizerWinsFirst: boolean;
  organizerUpi?: string;
  members: Member[];
  draws: DrawResult[];
  nextDrawAt?: string;
  status: 'draft' | 'active' | 'completed';
  createdAt: string;
}

export interface CreateChitPayload {
  name: string;
  description?: string;
  monthlyAmount: number;
  currency: string;
  totalMembers: number;
  organizerName: string;
  organizerEmail: string;
  organizerCountry: string;
  organizerWinsFirst: boolean;
  organizerUpi?: string;
}

export interface AddMemberPayload {
  name: string;
  email: string;
  phone?: string;
  country: string;
  upiEnabled?: boolean;
  upiId?: string;
}
