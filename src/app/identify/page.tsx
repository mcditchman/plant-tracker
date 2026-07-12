'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Droplet, Droplets, Leaf, Lightbulb, Loader2, PenLine, Sun, Thermometer, X } from 'lucide-react';
import { PlantIdentification, PlantCandidate } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Step = 'input' | 'loading' | 'candidates' | 'result' | 'adding' | 'done';
type InputMode = 'photo' | 'search';

const confidenceLabels = {
  high: 'Likely match',
  medium: 'Possible match',
  low: 'Long shot',
};

export default function IdentifyPage() {
  const [mode, setMode] = useState<InputMode>('photo');
  const [step, setStep] = useState<Step>('input');
  const [searchText, setSearchText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageType, setImageType] = useState<string>('image/jpeg');
  const [result, setResult] = useState<PlantIdentification | null>(null);
  const [candidates, setCandidates] = useState<PlantCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<PlantCandidate | null>(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [selectedPhotoAttribution, setSelectedPhotoAttribution] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('');
  const [location, setLocation] = useState('');
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function requestGeolocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* silently ignore if denied */ }
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageType('image/jpeg');
    requestGeolocation();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImagePreview(dataUrl);
        setImageBase64(dataUrl.split(',')[1]);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleIdentify() {
    setError('');
    setStep('loading');

    try {
      if (mode === 'search') {
        const res = await fetch('/api/identify/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: searchText, geoCoords }),
        });

        if (!res.ok) throw new Error('Failed to find candidates');
        const data = await res.json();
        setCandidates(data.candidates);
        setStep('candidates');
        return;
      }

      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, imageType, geoCoords }),
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

  async function handleSelectCandidate(candidate: PlantCandidate) {
    setError('');
    setStep('loading');

    try {
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchText: candidate.scientific_name, geoCoords }),
      });

      if (!res.ok) throw new Error('Failed to load plant details');
      const data = await res.json();
      setResult(data);
      setSelectedPhotoUrl(candidate.photo_url);
      setSelectedPhotoAttribution(candidate.photo_attribution_url);
      setStep('result');
    } catch {
      setError('Could not load plant details. Please try again.');
      setStep('candidates');
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
          photo_url: mode === 'photo' ? imagePreview : selectedPhotoUrl,
          photo_attribution_url: mode === 'search' ? selectedPhotoAttribution : null,
          geoCoords,
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
    setCandidates([]);
    setSelectedCandidate(null);
    setSelectedPhotoUrl(null);
    setSelectedPhotoAttribution(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Identify a plant</h1>
      <p className="text-muted-foreground text-sm mb-6">Take a photo or describe it — AI will show you matching options and set up a care schedule</p>

      {step === 'input' && (
        <div className="space-y-4">
          <Tabs value={mode} onValueChange={v => setMode(v as InputMode)}>
            <TabsList className="w-full">
              <TabsTrigger value="photo" className="flex-1"><Camera className="size-3.5" /> Upload photo</TabsTrigger>
              <TabsTrigger value="search" className="flex-1"><PenLine className="size-3.5" /> Describe it</TabsTrigger>
            </TabsList>
          </Tabs>

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
                  <Button
                    onClick={() => { setImagePreview(null); setImageBase64(null); }}
                    size="icon-sm"
                    variant="secondary"
                    className="absolute top-3 right-3 rounded-full"
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-48 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-primary/40 hover:bg-accent transition-colors"
                >
                  <Camera className="size-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-foreground font-medium">Take or upload a photo</p>
                    <p className="text-muted-foreground text-sm">Tap to choose from your camera or gallery</p>
                  </div>
                </button>
              )}
            </div>
          ) : (
            <div>
              <Input
                type="text"
                value={searchText}
                onChange={e => { setSearchText(e.target.value); if (e.target.value.length === 1) requestGeolocation(); }}
                onKeyDown={e => e.key === 'Enter' && searchText.trim() && handleIdentify()}
                placeholder="e.g. 'monstera', 'tall plant with big shiny leaves', 'that spiky cactus'"
              />
              <p className="text-xs text-muted-foreground mt-2">Describe what you see — name, shape, leaves, anything. We&apos;ll show you a few likely matches with photos to pick from.</p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          <Button
            onClick={handleIdentify}
            disabled={mode === 'photo' ? !imageBase64 : !searchText.trim()}
            className="w-full"
            size="lg"
          >
            {mode === 'photo' ? 'Identify plant' : 'Find matches'}
          </Button>
        </div>
      )}

      {step === 'loading' && (
        <div className="text-center py-16">
          <Loader2 className="size-8 mx-auto text-muted-foreground animate-spin mb-4" />
          <p className="text-foreground font-medium">Identifying your plant...</p>
          <p className="text-muted-foreground text-sm mt-1">This takes a few seconds</p>
        </div>
      )}

      {step === 'candidates' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Tap the one that matches:</p>
          {candidates.map((candidate, i) => (
            <button key={i} onClick={() => setSelectedCandidate(candidate)} className="w-full text-left">
              <Card className={`hover:shadow-md transition-all ${selectedCandidate === candidate ? 'ring-2 ring-primary' : 'hover:ring-primary/20'}`}>
                <CardContent className="flex gap-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-accent flex items-center justify-center flex-shrink-0">
                    {candidate.photo_url ? (
                      <img src={candidate.photo_url} alt={candidate.common_name} className="w-full h-full object-cover" />
                    ) : (
                      <Leaf className="size-8 text-primary/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground">{candidate.common_name}</h3>
                        <p className="text-xs text-muted-foreground italic">{candidate.scientific_name}</p>
                      </div>
                      <Badge variant="secondary" className="flex-shrink-0">{confidenceLabels[candidate.confidence]}</Badge>
                    </div>
                    <p className="text-sm text-foreground/80 mt-1">{candidate.description}</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          <Button
            onClick={() => selectedCandidate && handleSelectCandidate(selectedCandidate)}
            disabled={!selectedCandidate}
            className="w-full"
            size="lg"
          >
            Generate care guide
          </Button>

          <Button onClick={handleReset} variant="outline" className="w-full" size="lg">
            Start over
          </Button>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <Card>
            <CardContent>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{result.common_name}</h2>
                  {result.scientific_name && (
                    <p className="text-muted-foreground text-sm italic">{result.scientific_name}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {result.difficulty && (
                    <Badge variant="secondary">{result.difficulty}</Badge>
                  )}
                </div>
              </div>

              {(imagePreview || selectedPhotoUrl) && (
                <div className="mb-3">
                  <img
                    src={imagePreview || selectedPhotoUrl || ''}
                    alt={result.common_name}
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  {selectedPhotoAttribution && (
                    <a
                      href={selectedPhotoAttribution}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Photo via Wikipedia
                    </a>
                  )}
                </div>
              )}

              {result.description && (
                <p className="text-foreground/80 text-sm leading-relaxed">{result.description}</p>
              )}
            </CardContent>
          </Card>

          {/* Care overview */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-foreground mb-3">Care requirements</h3>
              <div className="space-y-2.5">
                {result.care.water && (
                  <div className="flex gap-3">
                    <Droplet className="size-4.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Water</p>
                      <p className="text-sm text-foreground/80">{result.care.water}</p>
                    </div>
                  </div>
                )}
                {result.care.light && (
                  <div className="flex gap-3">
                    <Sun className="size-4.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Light</p>
                      <p className="text-sm text-foreground/80">{result.care.light}</p>
                    </div>
                  </div>
                )}
                {result.care.humidity && (
                  <div className="flex gap-3">
                    <Droplets className="size-4.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Humidity</p>
                      <p className="text-sm text-foreground/80">{result.care.humidity}</p>
                    </div>
                  </div>
                )}
                {result.care.temperature && (
                  <div className="flex gap-3">
                    <Thermometer className="size-4.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Temperature</p>
                      <p className="text-sm text-foreground/80">{result.care.temperature}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          {result.tips && result.tips.length > 0 && (
            <Card className="bg-accent">
              <CardContent>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Lightbulb className="size-4" /> Quick tips
                </h3>
                <ul className="space-y-2">
                  {result.tips.map((tip, i) => (
                    <li key={i} className="text-sm text-foreground/80 flex gap-2">
                      <span className="text-primary flex-shrink-0">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Add to collection */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-foreground mb-4">Add to my plants</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="nickname">
                    Nickname <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="nickname"
                    type="text"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder={`e.g. "Living room ${result.common_name}"`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="location">
                    Location <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="location"
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Living room, Kitchen windowsill..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          {mode === 'search' && candidates.length > 0 && (
            <button
              onClick={() => setStep('candidates')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to results
            </button>
          )}

          <div className="flex gap-3">
            <Button onClick={handleReset} variant="outline" className="flex-1" size="lg">
              Try again
            </Button>
            <Button onClick={handleAddPlant} className="flex-1" size="lg">
              Add plant
            </Button>
          </div>
        </div>
      )}

      {step === 'adding' && (
        <div className="text-center py-16">
          <Loader2 className="size-8 mx-auto text-muted-foreground animate-spin mb-4" />
          <p className="text-foreground font-medium">Adding to your collection...</p>
        </div>
      )}
    </div>
  );
}
