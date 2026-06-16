'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CareType } from '@/types';

const careOptions: { type: CareType; label: string; icon: string }[] = [
  { type: 'fertilize', label: 'Fertilize', icon: '🌱' },
  { type: 'prune', label: 'Prune', icon: '✂️' },
  { type: 'repot', label: 'Repot', icon: '🪴' },
  { type: 'mist', label: 'Mist', icon: '🌫️' },
  { type: 'other', label: 'Other', icon: '📝' },
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
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
      >
        <span>✨</span>
        Log Care
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4">Log Care Activity</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {careOptions.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setSelected(opt.type)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors ${
                    selected === opt.type ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <span className="text-xl">{opt.icon}</span>
                  <span className="text-xs font-medium text-gray-700">{opt.label}</span>
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)..."
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:border-green-400"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-medium transition-colors"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
