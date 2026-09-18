import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SpinWheel } from '@/components/SpinWheel';
import { ChitFund, Member, DrawResult } from '@/types/chit';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Trophy, PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';

interface DrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chit: ChitFund;
  onSuccess: () => void;
}

export function DrawDialog({ open, onOpenChange, chit, onSuccess }: DrawDialogProps) {
  const [eligibleMembers, setEligibleMembers] = useState<Member[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<Member | null>(null);
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const drawLockRef = useRef(false);

  useEffect(() => {
    if (open) {
      loadEligibleMembers();
      setWinner(null);
      setDrawResult(null);
      setShowResult(false);
      setIsSpinning(false);
      drawLockRef.current = false;
    }
  }, [open, chit.id]);

  const loadEligibleMembers = async () => {
    const members = await api.getEligibleMembers(chit.id);
    setEligibleMembers(members);
  };

  const handleSpin = async () => {
    // The ref closes the race window before the async request starts.
    if (drawLockRef.current) return;

    drawLockRef.current = true;
    setIsSpinning(true);

    try {
      // Conduct draw on backend first to get winner
      const result = await api.conductDraw(chit.id, chit.currentMonth);
      const winningMember = eligibleMembers.find(m => m.id === result.winnerId);
      
      if (!winningMember) {
        throw new Error('Winner not found in eligible members');
      }

      setWinner(winningMember);
      setDrawResult(result);
    } catch (error) {
      // Release the lock only when the draw request failed so the user
      // can retry without allowing duplicate successful requests.
      drawLockRef.current = false;
      setIsSpinning(false);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to conduct draw.',
        variant: 'destructive',
      });
    }
  };

  const handleSpinComplete = () => {
    setIsSpinning(false);
    setShowResult(true);
    
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const getCurrencySymbol = (code: string): string => {
    const symbols: Record<string, string> = {
      INR: '₹', USD: '$', GBP: '£', EUR: '€',
      AED: 'د.إ', SGD: 'S$', AUD: 'A$', CAD: 'C$'
    };
    return symbols[code] || code;
  };

  const handleClose = () => {
    if (showResult) {
      onSuccess();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Monthly Draw - Month {chit.currentMonth}
          </DialogTitle>
          <DialogDescription>
            Spin the wheel to select this month's winner!
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-6">
          {eligibleMembers.length > 0 ? (
            <>
              <SpinWheel
                members={eligibleMembers}
                winner={winner}
                isSpinning={isSpinning}
                onSpinComplete={handleSpinComplete}
              />

              <AnimatePresence>
                {showResult && winner && drawResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="mt-6 text-center"
                  >
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <PartyPopper className="h-6 w-6 text-yellow-500" />
                      <span className="text-xl font-bold">Congratulations!</span>
                      <PartyPopper className="h-6 w-6 text-yellow-500" />
                    </div>
                    <p className="text-2xl font-bold text-primary">{winner.name}</p>
                    <p className="text-muted-foreground">
                      Wins {getCurrencySymbol(chit.currency)}{(chit.monthlyAmount * chit.totalMembers).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Month {drawResult.month} of {chit.durationMonths}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {!showResult && (
                <Button
                  size="lg"
                  className="mt-6"
                  onClick={handleSpin}
                  disabled={isSpinning}
                >
                  {isSpinning ? 'Spinning...' : 'Spin the Wheel'}
                </Button>
              )}

              {showResult && (
                <Button
                  className="mt-6"
                  onClick={handleClose}
                >
                  Close
                </Button>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <p>No eligible members for this draw.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
