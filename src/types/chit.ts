export interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  country: string;
  hasWon: boolean;
  wonInMonth?: number;
}

export interface DrawResult {
  id: string;
  month: number;
  winnerId: string;
  winnerName: string;
  drawnAt: string;
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
  organizerWinsFirst: boolean; // true = first month, false = last month
  members: Member[];
  draws: DrawResult[];
  status: 'draft' | 'active' | 'completed';
  createdAt: string;
}

export interface CreateChitPayload {
  name: string;
  description?: string;
  monthlyAmount: number;
  currency: string;
  totalMembers: number;
  durationMonths: number;
  organizerName: string;
  organizerEmail: string;
  organizerCountry: string;
  organizerWinsFirst: boolean;
}

export interface AddMemberPayload {
  name: string;
  email: string;
  phone?: string;
  country: string;
  upiEnabled?: boolean;
  upiId?: string;
}
