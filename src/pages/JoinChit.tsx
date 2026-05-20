import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Coins, Users, Calendar, Crown, UserPlus, CheckCircle2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/Header';
import { AddMemberDialog } from '@/components/AddMemberDialog';
import { MembersList } from '@/components/MembersList';
import { DrawHistory } from '@/components/DrawHistory';
import { api } from '@/lib/api';
import { ChitFund } from '@/types/chit';

export default function JoinChit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [chit, setChit] = useState<ChitFund | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  const loadChit = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getChit(id);
      setChit(data);
    } catch (error) {
      console.error('Failed to load chit:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChit();
  }, [id]);

  const getCurrencySymbol = (code: string): string => {
    const symbols: Record<string, string> = {
      INR: '₹', USD: '$', GBP: '£', EUR: '€',
      AED: 'د.إ', SGD: 'S$', AUD: 'A$', CAD: 'C$'
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

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <div className="animate-pulse space-y-6 max-w-lg mx-auto">
            <div className="h-8 bg-muted rounded w-1/2" />
            <div className="h-48 bg-muted rounded" />
          </div>
        </main>
      </div>
    );
  }

  // ─── Not found ─────────────────────────────────────────────────────────────

  if (!chit) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <Card className="max-w-md mx-auto text-center py-12">
            <CardHeader>
              <CardTitle>Chit/Kuri Not Found</CardTitle>
              <CardDescription>
                This invite link is invalid or the chit fund/kuri no longer exists.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/')}>Go to Dashboard</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const organizer = chit.members.find(m => m.id === chit.organizerId);
  const totalValue = chit.monthlyAmount * chit.totalMembers;
  const spotsLeft = chit.totalMembers - chit.members.length;
  const canJoin = chit.status === 'draft' && spotsLeft > 0;

  // ─── View-only mode (after joining) ────────────────────────────────────────

  if (hasJoined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />

        <main className="container py-8">
          {/* Success Banner */}
          <Alert className="mb-6 border-green-500/30 bg-green-500/10 max-w-2xl mx-auto">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <AlertTitle className="text-green-600">You've joined successfully!</AlertTitle>
            <AlertDescription className="text-green-700">
              You are now a member of <strong>{chit.name}</strong>. Here's your view of the chit fund.
            </AlertDescription>
          </Alert>

          {/* Chit Header */}
          <div className="max-w-2xl mx-auto mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{chit.name}</h1>
              <Badge variant="outline" className={getStatusColor(chit.status)}>
                {chit.status.charAt(0).toUpperCase() + chit.status.slice(1)}
              </Badge>
            </div>
            {chit.description && (
              <p className="text-muted-foreground">{chit.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Crown className="h-4 w-4 text-yellow-500" />
              <span>Organized by <span className="font-medium text-foreground">{organizer?.name}</span></span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 max-w-2xl mx-auto">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="text-xl font-bold">
                  {getCurrencySymbol(chit.currency)}{chit.monthlyAmount.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Total Pot</p>
                <p className="text-xl font-bold text-primary">
                  {getCurrencySymbol(chit.currency)}{totalValue.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Members</p>
                <p className="text-xl font-bold">
                  {chit.members.length}/{chit.totalMembers}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-xl font-bold">{chit.durationMonths} months</p>
              </CardContent>
            </Card>
          </div>

          {/* Organizer Rule */}
          <Card className="mb-6 border-primary/20 bg-primary/5 max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Crown className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Organizer Win Rule</p>
                  <p className="text-sm text-muted-foreground">
                    {chit.organizerWinsFirst
                      ? `${organizer?.name} (organizer) will receive the chit in the first month`
                      : `${organizer?.name} (organizer) will receive the chit in the last month`
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Members + History Tabs — view only */}
          <div className="max-w-2xl mx-auto">
            <Tabs defaultValue="members">
              <TabsList>
                <TabsTrigger value="members" className="gap-2">
                  <Users className="h-4 w-4" />
                  Members ({chit.members.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2">
                  <Trophy className="h-4 w-4" />
                  Draw History ({chit.draws.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="members">
                {/* Read-only member list — no delete buttons */}
                <Card>
                  <CardContent className="pt-6 space-y-3">
                    {chit.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-background"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{member.name}</p>
                              {member.id === chit.organizerId && (
                                <Badge variant="outline" className="text-xs py-0">
                                  <Crown className="h-3 w-3 mr-1 text-yellow-500" />
                                  Organizer
                                </Badge>
                              )}
                              {member.hasWon && (
                                <Badge variant="outline" className="text-xs py-0 text-green-600 border-green-500/30">
                                  <Trophy className="h-3 w-3 mr-1" />
                                  Won M{member.wonInMonth}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{member.country}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <DrawHistory chit={chit} />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    );
  }

  // ─── Join page (before joining) ────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8 max-w-lg mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Coins className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">{chit.name}</CardTitle>
            {chit.description && (
              <CardDescription>{chit.description}</CardDescription>
            )}
            <Badge
              variant="outline"
              className={`${getStatusColor(chit.status)} w-fit mx-auto`}
            >
              {chit.status.charAt(0).toUpperCase() + chit.status.slice(1)}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Chit Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="text-lg font-bold">
                  {getCurrencySymbol(chit.currency)}{chit.monthlyAmount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Pot</p>
                <p className="text-lg font-bold text-primary">
                  {getCurrencySymbol(chit.currency)}{totalValue.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
                <p className="text-lg font-bold">{chit.members.length}/{chit.totalMembers}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Duration</p>
                </div>
                <p className="text-lg font-bold">{chit.durationMonths} months</p>
              </div>
            </div>

            {/* Organizer */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Crown className="h-4 w-4 text-yellow-500" />
              <span>Organized by <span className="font-medium text-foreground">{organizer?.name}</span></span>
            </div>

            {/* Join CTA */}
            {canJoin ? (
              <div className="space-y-3">
                <p className="text-sm text-center text-muted-foreground">
                  {spotsLeft} spot{spotsLeft > 1 ? 's' : ''} remaining
                </p>
                <Button className="w-full" size="lg" onClick={() => setJoinDialogOpen(true)}>
                  <UserPlus className="mr-2 h-5 w-5" />
                  Join This Chit Fund/Kuri
                </Button>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  {chit.status !== 'draft'
                    ? 'This chit fund/kuri is already active and no longer accepting new members.'
                    : 'This chit fund/kuri is full.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {id && (
        <AddMemberDialog
          open={joinDialogOpen}
          onOpenChange={setJoinDialogOpen}
          chitId={id}
          onSuccess={async () => {
            await loadChit();   // reload chit with new member included
            setHasJoined(true); // switch to view-only mode
          }}
        />
      )}
    </div>
  );
}
