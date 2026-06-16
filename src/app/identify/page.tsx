'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlantIdentification } from '@/types';

type Step = 'input' | 'loading' | 'result' | 'adding' | 'done';
type InputMode = 'photo' | 'search';

const difficultyColors = {
  easy: 'bg-green-100 text-green-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

export default function IdentifyPage() {
  const [mode, setMode] = useState<InputMode>('photo');
  const [step, setStep] = useState<Step>('input');
  const [searchText, setSearchText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageType, setImageType] = useState<string>('image/jpeg');
  const [result, setResult] = useState<PlantIdentification | null>(null);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('');
  const [location, setLocation] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      // Extract base64 part (after the comma)
      const base64 = dataUrl.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  async function handleIdentify() {
    setError('');
    setStep('loading');

    try {
      const body = mode === 'photo'
        ? { imageBase64, imageType }
        : { searchText };

      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to identify plant');
      const data = await res.json();
      setResult(data);
      setStep('result');
    } catch {
      setError('Could not identify plant. Please try again.');
      setStep('input');
    }
  }

  async function handleAddPlant() {
    if (!result) return;
    setStep('adding');

    try {
      const res = await fetch('/api/plants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...result,
          nickname: nickname || null,
          location: location || null,
          photo_url: mode === 'photo' ? imagePreview : null,
        }),
      });

      if (!res.ok) throw new Error('Failed to add plant');
      const plant = await res.json();
      router.push(`/plants/${plant.id}`);
      router.refresh();
    } catch {
      setError('Failed to add plant. Please try again.');
      setStep('result');
    }
  }

  function handleReset() {
    setStep('input');
    setResult(null);
    setError('');
    setImagePreview(null);
    setImageBase64(null);
    setSearchText('');
    setNickname('');
    setLocation('');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Identify a Plant</h1>
      <p className="text-gray-500 text-sm mb-6">Take a photo or search by name — AI will identify it and set up a care schedule</p>

      {step === 'input' && (
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setMode('photo')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'photo' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            >
              📷 Upload Photo
            </button>
            <button
              onClick={() => setMode('search')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'search' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            >
              🔍 Search by Name
            </button>
          </div>

          {mode === 'photo' ? (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Plant" className="w-full h-64 object-cover rounded-2xl" />
                  <button
                    onClick={() => { setImagePreview(null); setImageBase64(null); }}
                    className="absolute top-3 right-3 bg-white/90 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold hover:bg-white"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-48 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-green-300 hover:bg-green-50 transition-colors"
                >
                  <span className="text-4xl">📷</span>
                  <div className="text-center">
                    <p className="text-gray-700 font-medium">Take or upload a photo</p>
                    <p className="text-gray-400 text-sm">Tap to choose from your camera or gallery</p>
                  </div>
                </button>
              )}
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchText.trim() && handleIdentify()}
                placeholder="e.g. 'monstera', 'snake plant', 'that spiky cactus'"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
              />
              <p className="text-xs text-gray-400 mt-2">Don&apos;t know the name? Try describing it — &quot;tall plant with big leaves&quot; works too!</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          <button
            onClick={handleIdentify}
            disabled={mode === 'photo' ? !imageBase64 : !searchText.trim()}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Identify Plant
          </button>
        </div>
      )}

      {step === 'loading' && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 animate-pulse">🔍</div>
          <p className="text-gray-700 font-medium">Identifying your plant...</p>
          <p className="text-gray-400 text-sm mt-1">This takes a few seconds</p>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{result.common_name}</h2>
                {result.scientific_name && (
                  <p className="text-gray-400 text-sm italic">{result.scientific_name}</p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {result.difficulty && (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${difficultyColors[result.difficulty]}`}>
                    {result.difficulty}
                  </span>
                )}
              </div>
            </div>

            {imagePreview && (
              <img src={imagePreview} alt={result.common_name} className="w-full h-48 object-cover rounded-xl mb-3" />
            )}

            {result.description && (
              <p className="text-gray-600 text-sm leading-relaxed">{result.description}</p>
            )}
          </div>

          {/* Care overview */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Care Requirements</h3>
            <div className="space-y-2.5">
              {result.care.water && (
                <div className="flex gap-3">
                  <span className="text-lg w-6 flex-shrink-0">💧</span>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Water</p>
                    <p className="text-sm text-gray-700">{result.care.water}</p>
                  </div>
                </div>
              )}
              {result.care.light && (
                <div className="flex gap-3">
                  <span className="text-lg w-6 flex-shrink-0">☀️</span>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Light</p>
                    <p className="text-sm text-gray-700">{result.care.light}</p>
                  </div>
                </div>
              )}
              {result.care.humidity && (
                <div className="flex gap-3">
                  <span className="text-lg w-6 flex-shrink-0">🌫️</span>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Humidity</p>
                    <p className="text-sm text-gray-700">{result.care.humidity}</p>
                  </div>
                </div>
              )}
              {result.care.temperature && (
                <div className="flex gap-3">
                  <span className="text-lg w-6 flex-shrink-0">🌡️</span>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Temperature</p>
                    <p className="text-sm text-gray-700">{result.care.temperature}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tips */}
          {result.tips && result.tips.length > 0 && (
            <div className="bg-green-50 rounded-2xl border border-green-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">💡 Quick Tips</h3>
              <ul className="space-y-2">
                {result.tips.map((tip, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-green-500 flex-shrink-0">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add to collection */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Add to My Plants</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nickname <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder={`e.g. "Living room ${result.common_name}"`}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Living room, Kitchen windowsill..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          <div className="flex gap-3">
            <button onClick={handleReset} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium">
              Try Again
            </button>
            <button
              onClick={handleAddPlant}
              className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
            >
              Add to My Plants 🌱
            </button>
          </div>
        </div>
      )}

      {step === 'adding' && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 animate-pulse">🌱</div>
          <p className="text-gray-700 font-medium">Adding to your collection...</p>
        </div>
      )}
    </div>
  );
}
