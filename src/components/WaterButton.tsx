'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
    <button
      onClick={handleWater}
      disabled={loading}
      className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
    >
      <span>{loading ? '⏳' : '💧'}</span>
      {loading ? 'Watering...' : 'Water Now'}
    </button>
  );
}
