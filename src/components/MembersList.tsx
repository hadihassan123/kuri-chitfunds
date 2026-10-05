import { ChitFund, Member } from '@/types/chit';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, Trash2, Trophy, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface MembersListProps {
  chit: ChitFund;
  onUpdate: () => void;
}

export function MembersList({ chit, onUpdate }: MembersListProps) {
  const handleRemove = async (member: Member) => {
    if (member.id === chit.organizerId) {
      toast({
        title: 'Cannot Remove',
        description: 'The organizer cannot be removed from the chit.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await api.removeMember(chit.id, member.id);
      toast({
        title: 'Member Removed',
        description: `${member.name} has been removed from the chit.`,
      });
      onUpdate();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove member.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Status</TableHead>
            {chit.status === 'draft' && <TableHead className="w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {chit.members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{member.name}</span>
                      {member.id === chit.organizerId && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{member.email}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm">{member.country}</span>
                </div>
              </TableCell>
              <TableCell>
                {member.hasWon ? (
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                    <Trophy className="h-3 w-3 mr-1" />
                    Won (Month {member.wonInMonth})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Waiting
                  </Badge>
                )}
              </TableCell>
              {chit.status === 'draft' && (
                <TableCell>
                  {member.id !== chit.organizerId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Remove ${member.name}`}
                      title={`Remove ${member.name}`}
                      onClick={() => handleRemove(member)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
          {chit.members.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                No members yet. Add members to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
