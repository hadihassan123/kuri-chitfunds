import { useEffect,useState } from 'react';
import { Copy, Check, Link as LinkIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
];

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'UAE', 'Singapore', 'Malaysia', 'New Zealand',
  'Ireland', 'Netherlands', 'Switzerland', 'Other'
];

const formSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50),
  description: z.string().max(200).optional(),
  monthlyAmount: z.coerce.number().min(1, 'Amount must be positive'),
  currency: z.string().min(1, 'Select a currency'),
  totalMembers: z.coerce.number().min(2, 'At least 2 members required').max(20, 'Maximum 20 members'),
  durationMonths: z.coerce.number().min(2, 'At least 2 months required').max(24, 'Maximum 24 months'),
  organizerName: z.string().min(2, 'Name is required').max(50),
  organizerEmail: z.string().email('Valid email required'),
  organizerCountry: z.string().min(1, 'Select your country'),
  organizerWinsFirst: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateChitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateChitDialog({ open, onOpenChange, onSuccess }: CreateChitDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      monthlyAmount: 10000,
      currency: 'INR',
      totalMembers: 10,
      durationMonths: 10,
      organizerName: '',
      organizerEmail: '',
      organizerCountry: 'India',
      organizerWinsFirst: true,
    },
  });

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase!.auth.getUser();

      if (!user) return;

      form.setValue(
        'organizerName',
        user.user_metadata?.full_name || ''
      );

      form.setValue(
        'organizerEmail',
        user.email || ''
      );
    };

    if (open) loadUser();
  }, [open]);

  const getShareableLink = (chitId: string) => {
    return `${window.location.origin}/join/${chitId}`;
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy the link manually.', variant: 'destructive' });
    }
  };

  const handleClose = () => {
    if (createdLink) {
      setCreatedLink(null);
      setCopied(false);
      form.reset();
      onSuccess();
    }
    onOpenChange(false);
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const newChit = await api.createChit({
        name: values.name,
        description: values.description,
        monthlyAmount: values.monthlyAmount,
        currency: values.currency,
        totalMembers: values.totalMembers,
        durationMonths: values.durationMonths,
        organizerName: values.organizerName,
        organizerEmail: values.organizerEmail,
        organizerCountry: values.organizerCountry,
        organizerWinsFirst: values.organizerWinsFirst,
      });
      setCreatedLink(getShareableLink(newChit.id));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create chit fund/kuri. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show success screen with shareable link
  if (createdLink) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Chit Fund/Kuri Created!
            </DialogTitle>
            <DialogDescription>
              Share this link with members so they can join your chit fund/kuri.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate select-all">{createdLink}</span>
              </div>
              <Button size="icon" variant="outline" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Members can use this link to view the chit details and join as participants.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Chit Fund/Kuri</DialogTitle>
          <DialogDescription>
            Set up a new chit fund/kuri group. You'll be registered as the organizer.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Chit Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Chit Details</h3>
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chit Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Family Savings 2025" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="A brief description of this chit fund..." 
                        className="resize-none"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="monthlyAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Amount</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CURRENCIES.map((currency) => (
                            <SelectItem key={currency.code} value={currency.code}>
                              {currency.symbol} {currency.code} - {currency.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="totalMembers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Members</FormLabel>
                      <FormControl>
                        <Input type="number" min={2} max={20} {...field} />
                      </FormControl>
                      <FormDescription>2-20 members allowed</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="durationMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (Months)</FormLabel>
                      <FormControl>
                        <Input type="number" min={2} max={24} {...field} />
                      </FormControl>
                      <FormDescription>Usually equals member count</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="organizerWinsFirst"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Organizer Wins First</FormLabel>
                      <FormDescription>
                        {field.value 
                          ? 'Organizer will receive the chit in the first month' 
                          : 'Organizer will receive the chit in the last month'}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Organizer Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Your Details (Organizer)</h3>
              
              <FormField
                control={form.control}
                name="organizerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="organizerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} readOnly />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="organizerCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COUNTRIES.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Chit Fund/Kuri'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
