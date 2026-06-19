'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function WaterButton({ plantId }: { plantId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleWater() {
    setLoading(true);
    try {
      await fetch(`/api/plants/${plantId}/water`, { method: 'POST' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleWater}
      disabled={loading}
      size="lg"
      className="gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white"
    >
      <span>{loading ? '⏳' : '💧'}</span>
      {loading ? 'Watering...' : 'Water Now'}
    </Button>
  );
}
