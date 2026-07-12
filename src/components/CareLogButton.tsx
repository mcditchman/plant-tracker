'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NotebookPen, Scissors, Shovel, SprayCan, Sprout, type LucideIcon } from 'lucide-react';
import { CareType } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';

const careOptions: { type: CareType; label: string; Icon: LucideIcon }[] = [
  { type: 'fertilize', label: 'Fertilize', Icon: Sprout },
  { type: 'prune', label: 'Prune', Icon: Scissors },
  { type: 'repot', label: 'Repot', Icon: Shovel },
  { type: 'mist', label: 'Mist', Icon: SprayCan },
  { type: 'other', label: 'Other', Icon: NotebookPen },
];

export default function CareLogButton({ plantId }: { plantId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CareType>('fertilize');
  const [notes, setNotes] = useState('');
  const router = useRouter();

  async function handleSubmit() {
    setLoading(true);
    try {
      await fetch(`/api/plants/${plantId}/care`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ care_type: selected, notes }),
      });
      setOpen(false);
      setNotes('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="lg" variant="outline" className="gap-2" />}>
        <NotebookPen />
        Log Care
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Log Care Activity</SheetTitle>
        </SheetHeader>
        <div className="px-4 grid grid-cols-3 gap-2">
          {careOptions.map(opt => (
            <button
              key={opt.type}
              onClick={() => setSelected(opt.type)}
              className={cn(
                'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors',
                selected === opt.type ? 'border-primary bg-accent' : 'border-border hover:border-muted-foreground/30'
              )}
            >
              <opt.Icon className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{opt.label}</span>
            </button>
          ))}
        </div>
        <div className="px-4">
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)..."
            className="resize-none h-20"
          />
        </div>
        <SheetFooter className="flex-row">
          <SheetClose render={<Button variant="outline" className="flex-1" />}>
            Cancel
          </SheetClose>
          <Button onClick={handleSubmit} disabled={loading} className="flex-1">
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
