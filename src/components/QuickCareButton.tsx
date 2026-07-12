'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Rendered inside <Link> rows, so the click must not trigger navigation
export default function QuickCareButton({
  plantId,
  action,
  compact = false,
}: {
  plantId: string;
  action: 'water' | 'fertilize';
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      if (action === 'water') {
        await fetch(`/api/plants/${plantId}/water`, { method: 'POST' });
      } else {
        await fetch(`/api/plants/${plantId}/care`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ care_type: 'fertilize' }),
        });
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const label = action === 'water' ? 'Water' : 'Fertilize';

  if (compact) {
    return (
      <Button
        onClick={handleClick}
        disabled={loading}
        size="icon-sm"
        variant="outline"
        className="flex-shrink-0"
        aria-label={action === 'water' ? 'Mark watered' : 'Mark fertilized'}
        title={action === 'water' ? 'Mark watered' : 'Mark fertilized'}
      >
        {loading ? <Loader2 className="animate-spin" /> : <Check />}
      </Button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      size="sm"
      variant="outline"
      className="flex-shrink-0 gap-1.5"
    >
      {loading ? <Loader2 className="animate-spin" /> : <Check />}
      {label}
    </Button>
  );
}
