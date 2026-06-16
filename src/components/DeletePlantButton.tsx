'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeletePlantButton({ plantId }: { plantId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    try {
      await fetch(`/api/plants/${plantId}`, { method: 'DELETE' });
      router.push('/');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Remove this plant?</span>
        <button onClick={handleDelete} disabled={loading} className="text-sm text-red-600 font-medium hover:text-red-700">
          {loading ? 'Removing...' : 'Yes, remove'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirm(true)} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
      Remove plant
    </button>
  );
}
