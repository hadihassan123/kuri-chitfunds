import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, PlayCircle, Users, Calendar, Crown, Info, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/Header';
import { MembersList } from '@/components/MembersList';
import { DrawHistory } from '@/components/DrawHistory';
import { AddMemberDialog } from '@/components/AddMemberDialog';
import { DrawDialog } from '@/components/DrawDialog';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { ChitFund, Payment } from '@/types/chit';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

function PaymentsTab({ chit, currentUserId }: { chit: ChitFund; currentUserId: string }) {
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    api.getPayments(chit.id).then(setPayments).catch(console.error);
  }, [chit.id]);

  const isOrganizer = chit.organizerId === currentUserId;
  const currentMonthPayments = payments.filter(p => p.month === (chit.currentMonth ?? 1) - 1);

  const handlePayUPI = () => {
    const upiUrl = `upi://pay?pa=${chit.organizerUpi}&pn=Kuri&am=${chit.monthlyAmount}&cu=INR&tn=Kuri+Month+${(chit.currentMonth ?? 1) - 1}`;
    window.location.href = upiUrl;
  };

  const handleMarkPaid = async (paymentId: string) => {
    try {
      await api.markPaid(chit.id, paymentId);
      const updated = await api.getPayments(chit.id);
      setPayments(updated);
    } catch (error: any) {
      toast({ title: 'Failed to mark paid', description: error?.message, variant: 'destructive' });
    }
  };

  const handleMarkUnpaid = async (paymentId: string) => {
    try {
      await api.markUnpaid(chit.id, paymentId);
      const updated = await api.getPayments(chit.id);
      setPayments(updated);
    } catch (error: any) {
      toast({ title: 'Failed to mark unpaid', description: error?.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {currentMonthPayments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No payments yet. Conduct a draw first.</p>
      ) : (
        currentMonthPayments.map(payment => {
          const member = chit.members.find(m => m.id === payment.member_id);
          const isOwnPayment = member?.id === currentUserId;

          return (
            <div key={payment.id} className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">{member?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {chit.currency} {payment.amount} — Month {payment.month}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {payment.is_paid ? (
                  <>
                    <span className="text-green-600 text-sm font-medium">✓ Paid</span>
                    {isOrganizer && (
                      <Button size="sm" variant="ghost" onClick={() => handleMarkUnpaid(payment.id)}>
                        Undo
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {isOwnPayment && chit.organizerUpi && (
                      <Button size="sm" onClick={handlePayUPI}>
                        Pay via UPI
                      </Button>
                    )}
                    {(isOrganizer || isOwnPayment) && (
                      <Button size="sm" variant="outline" onClick={() => handleMarkPaid(payment.id)}>
                        Mark as Paid
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function ChitDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [chit, setChit] = useState<ChitFund | null>(null);
  const [loading, setLoading] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [drawDialogOpen, setDrawDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    supabase?.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const loadChit = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getChit(id);
      setChit(data);
    } catch (error: any) {
      console.error('Failed to load chit:', error);
      toast({
        title: 'Failed to load chit',
        description: error?.message || 'Please refresh the page.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChit();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4" />
            <div className="h-48 bg-muted rounded" />
          </div>
        </main>
      </div>
    );
  }

  if (!chit) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <Card className="max-w-md mx-auto text-center py-12">
            <CardHeader>
              <CardTitle>Chit/Kuri Not Found</CardTitle>
              <CardDescription>
                The chit fund/kuri you're looking for doesn't exist.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const getCurrencySymbol = (code: string): string => {
    const symbols: Record<string, string> = {
      INR: '₹', USD: '$', GBP: '£', EUR: '€',
      AED: 'د.إ', SGD: 'S$', AUD: 'A$', CAD: 'C$',
    };
    return symbols[code] || code;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'draft': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'active': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'completed': return 'bg-muted text-muted-foreground border-muted';
      default: return '';
    }
  };

  const organizer = chit.members.find(m => m.id === chit.organizerId);
  const totalValue = chit.monthlyAmount * chit.totalMembers;
  const canAddMembers = chit.status === 'draft' && chit.members.length < chit.totalMembers;
  const canDraw = chit.status === 'active' && (chit.currentMonth ?? 0) <= chit.durationMonths;
  const membersNeeded = chit.totalMembers - chit.members.length;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <Button variant="ghost" className="mb-6" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{chit.name}</h1>
              <Badge variant="outline" className={getStatusColor(chit.status)}>
                {chit.status.charAt(0).toUpperCase() + chit.status.slice(1)}
              </Badge>
            </div>
            {chit.description && (
              <p className="text-muted-foreground mb-4">{chit.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Crown className="h-4 w-4" />
                Organized by {organizer?.name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Created {format(new Date(chit.createdAt), 'PP')}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            {canAddMembers && (
              <>
                <Button variant="outline" onClick={() => {
                  const link = `${window.location.origin}/join/${chit.id}`;
                  navigator.clipboard.writeText(link).then(() => {
                    toast({ title: 'Invite link copied!', description: 'Share this link with members to join.' });
                  }).catch(() => {
                    toast({ title: 'Copy failed', variant: 'destructive' });
                  });
                }}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Copy Invite Link
                </Button>
                <Button variant="outline" onClick={() => setAddMemberOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Member
                </Button>
              </>
            )}
            {canDraw && (
              <Button onClick={() => setDrawDialogOpen(true)}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Conduct Draw
              </Button>
            )}
          </div>
        </div>

        {chit.status === 'draft' && membersNeeded > 0 && (
          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertTitle>Waiting for Members</AlertTitle>
            <AlertDescription>
              {membersNeeded} more member{membersNeeded > 1 ? 's' : ''} needed to start the chit.
              Once all {chit.totalMembers} members join, the chit will automatically become active.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Monthly Contribution</p>
              <p className="text-2xl font-bold">
                {getCurrencySymbol(chit.currency)}{chit.monthlyAmount.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Pot</p>
              <p className="text-2xl font-bold text-primary">
                {getCurrencySymbol(chit.currency)}{totalValue.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Members</p>
              <p className="text-2xl font-bold">
                {chit.members.length}/{chit.totalMembers}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {chit.status === 'active' ? 'Current Month' : 'Duration'}
              </p>
              <p className="text-2xl font-bold">
                {chit.status === 'active'
                  ? `${chit.currentMonth}/${chit.durationMonths}`
                  : `${chit.durationMonths} months`}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Crown className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Organizer Win Rule</p>
                <p className="text-sm text-muted-foreground">
                  {chit.organizerWinsFirst
                    ? `${organizer?.name} (organizer) will receive the chit in the first month`
                    : `${organizer?.name} (organizer) will receive the chit in the last month`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="members" className="space-y-6">
          <TabsList>
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              Members ({chit.members.length})
            </TabsTrigger>
            <TabsTrigger value="payments">
              Payments
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              History ({chit.draws.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <MembersList chit={chit} onUpdate={loadChit} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsTab chit={chit} currentUserId={currentUserId} />
          </TabsContent>

          <TabsContent value="history">
            <DrawHistory chit={chit} />
          </TabsContent>
        </Tabs>
      </main>

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        chitId={chit.id}
        onSuccess={loadChit}
      />

      <DrawDialog
        open={drawDialogOpen}
        onOpenChange={setDrawDialogOpen}
        chit={chit}
        onSuccess={loadChit}
      />
    </div>
  );
}