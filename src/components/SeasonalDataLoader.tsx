'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function SeasonalDataLoader({ plantId, hasSeasonalData }: { plantId: string; hasSeasonalData: boolean }) {
  const router = useRouter();
  const triggered = useRef(false);

  useEffect(() => {
    if (hasSeasonalData || triggered.current) return;
    triggered.current = true;

    function backfill(hemisphere: 'northern' | 'southern' | null) {
      fetch(`/api/plants/${plantId}/seasonal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hemisphere }),
      })
        .then(() => router.refresh())
        .catch(() => { /* silently ignore; retried on next visit */ });
    }

    if (!navigator.geolocation) {
      backfill(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => backfill(pos.coords.latitude >= 0 ? 'northern' : 'southern'),
      () => backfill(null)
    );
  }, [plantId, hasSeasonalData, router]);

  return null;
}
