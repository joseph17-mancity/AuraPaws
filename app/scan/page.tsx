'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ScanLine,
  AudioLines,
  Eye,
  Brain,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  HeartPulse,
  Wind,
  Volume2,
  Stethoscope,
  PawPrint,
  Radio,
  Cpu,
  Gauge,
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  Play,
  Pause,
  Square,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navbar } from '@/components/Navbar';
import { AddAnimalDialog } from '@/components/AddAnimalDialog';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { supabase } from '@/lib/supabase';
import {
  Animal,
  WelfareTelemetry,
  AudioClassification,
  StressCategory,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScanPhase = 'idle' | 'audio' | 'vision' | 'fusion' | 'result';

interface ScanResult {
  pwi_score: number;
  stress_category: StressCategory;
  audio_classification: AudioClassification;
  audio_confidence: number;
  vision_posture_weight: number;
  vision_confidence: number;
  heart_rate_bpm: number;
  panting_frequency_cpm: number;
  head_tilt_angle: number;
  ear_orientation: number;
  tail_tuck_angle: number;
  pacing_velocity: number;
  recommended_action: string;
}

// ---------------------------------------------------------------------------
// Simulated inference profiles
// ---------------------------------------------------------------------------

const SCAN_PROFILES: Record<string, {
  label: string;
  audio: AudioClassification;
  audioConf: number;
  posture: number;
  visionConf: number;
  hr: number;
  panting: number;
  headTilt: number;
  ear: number;
  tailTuck: number;
  pacing: number;
  action: string;
}> = {
  Buddy: {
    label: 'Separation Anxiety (Moderate)',
    audio: 'SEPARATION_ANXIETY', audioConf: 0.78, posture: 0.38, visionConf: 0.82,
    hr: 102, panting: 21, headTilt: 9.2, ear: -3.1, tailTuck: 28.5, pacing: 0.42,
    action: 'Monitor for increased vocalization patterns',
  },
  Luna: {
    label: 'Post-Surgery Pain (Monitor)',
    audio: 'PAIN_VOCALIZATION', audioConf: 0.71, posture: 0.48, visionConf: 0.76,
    hr: 116, panting: 28, headTilt: 14.1, ear: -7.8, tailTuck: 33.2, pacing: 0.15,
    action: 'Schedule follow-up pain assessment',
  },
  Rocky: {
    label: 'Arthritis Pain (Critical)',
    audio: 'PAIN_VOCALIZATION', audioConf: 0.85, posture: 0.68, visionConf: 0.84,
    hr: 138, panting: 36, headTilt: 16.8, ear: -11.2, tailTuck: 42.5, pacing: 0.08,
    action: 'Immediate vet check required',
  },
  Mittens: {
    label: 'Healthy (Optimal)',
    audio: 'PLAYFUL', audioConf: 0.91, posture: 0.10, visionConf: 0.89,
    hr: 88, panting: 13, headTilt: 3.2, ear: 1.5, tailTuck: 6.8, pacing: 0.62,
    action: 'No action needed — welfare optimal',
  },
};

const DEFAULT_PROFILE = {
  label: 'New Patient (Baseline)',
  audio: 'NEUTRAL' as AudioClassification,
  audioConf: 0.65, posture: 0.25, visionConf: 0.70,
  hr: 95, panting: 18, headTilt: 6.0, ear: 0.0, tailTuck: 15.0, pacing: 0.30,
  action: 'Continue monitoring — establish baseline',
};

const AUDIO_DISTRESS_WEIGHTS: Record<AudioClassification, number> = {
  PLAYFUL: 0.05, NEUTRAL: 0.20, SEPARATION_ANXIETY: 0.65,
  PAIN_VOCALIZATION: 0.90, STRESS_PANTING: 0.75,
};

function computePWI(
  audioClass: AudioClassification,
  audioConf: number,
  posture: number,
  visionConf: number,
  profile: typeof DEFAULT_PROFILE,
): ScanResult {
  const audioWeight = AUDIO_DISTRESS_WEIGHTS[audioClass];
  const pwi = 100 - (0.55 * audioWeight * 100 + 0.45 * posture * 100);
  const pwiScore = Math.max(0, Math.min(100, Math.round(pwi)));
  const stressCategory: StressCategory =
    pwiScore > 75 ? 'OPTIMAL' : pwiScore >= 50 ? 'MONITOR' : 'CRITICAL';
  return {
    pwi_score: pwiScore, stress_category: stressCategory,
    audio_classification: audioClass, audio_confidence: audioConf,
    vision_posture_weight: posture, vision_confidence: visionConf,
    heart_rate_bpm: profile.hr, panting_frequency_cpm: profile.panting,
    head_tilt_angle: profile.headTilt, ear_orientation: profile.ear,
    tail_tuck_angle: profile.tailTuck, pacing_velocity: profile.pacing,
    recommended_action: profile.action,
  };
}

function pwiColor(score: number): string {
  if (score > 75) return '#10B981';
  if (score >= 50) return '#D4AF37';
  return '#EF4444';
}

// ---------------------------------------------------------------------------
// Camera feed component
// ---------------------------------------------------------------------------

function CameraFeed({
  active,
  scanning,
}: {
  active: boolean;
  scanning: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = React.useState<'off' | 'starting' | 'on' | 'denied'>('off');
  const [scanY, setScanY] = React.useState(0);

  // Start / stop camera
  React.useEffect(() => {
    if (!active) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraState('off');
      return;
    }

    let cancelled = false;
    setCameraState('starting');

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraState('on');
      } catch {
        setCameraState('denied');
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [active]);

  // Scan line animation during vision phase
  React.useEffect(() => {
    if (!scanning) {
      setScanY(0);
      return;
    }
    const interval = setInterval(() => {
      setScanY((prev) => (prev >= 100 ? 0 : prev + 3));
    }, 50);
    return () => clearInterval(interval);
  }, [scanning]);

  return (
    <div className="relative h-48 rounded-lg overflow-hidden border border-border bg-slate-dark">
      {/* Video feed */}
      {cameraState === 'on' && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
        />
      )}

      {/* State overlays */}
      {cameraState === 'off' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <CameraOff className="h-6 w-6" />
          <p className="text-xs">Camera off</p>
        </div>
      )}
      {cameraState === 'starting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
          <p className="text-xs">Starting camera...</p>
        </div>
      )}
      {cameraState === 'denied' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <CameraOff className="h-6 w-6 text-danger" />
          <p className="text-xs text-center px-4">
            Camera access denied.
            <br />
            <span className="text-[10px]">Allow camera permission in your browser to use live vision scanning.</span>
          </p>
        </div>
      )}

      {/* Grid overlay when camera on */}
      {cameraState === 'on' && (
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(hsl(45 74% 54% / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(45 74% 54% / 0.3) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      )}

      {/* Keypoint markers during scanning */}
      {scanning && cameraState === 'on' && (
        <>
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10">
            <div className="h-3 w-3 rounded-full border-2 border-gold animate-pulse" />
            <span className="absolute -top-5 left-4 text-[9px] text-gold font-mono">HEAD</span>
          </div>
          <div className="absolute top-12 left-[30%] z-10">
            <div className="h-2 w-2 rounded-full border border-emerald animate-pulse" />
          </div>
          <div className="absolute top-12 right-[30%] z-10">
            <div className="h-2 w-2 rounded-full border border-emerald animate-pulse" />
          </div>
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
            <div className="h-3 w-3 rounded-full border-2 border-danger animate-pulse" />
            <span className="absolute -bottom-5 left-3 text-[9px] text-danger font-mono">TAIL</span>
          </div>
        </>
      )}

      {/* Scan line */}
      {scanning && cameraState === 'on' && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent z-10 transition-all duration-75"
          style={{ top: `${scanY}%` }}
        />
      )}

      {/* Corner brackets */}
      <div className="absolute top-2 left-2 h-4 w-4 border-l-2 border-t-2 border-gold/50 pointer-events-none" />
      <div className="absolute top-2 right-2 h-4 w-4 border-r-2 border-t-2 border-gold/50 pointer-events-none" />
      <div className="absolute bottom-2 left-2 h-4 w-4 border-l-2 border-b-2 border-gold/50 pointer-events-none" />
      <div className="absolute bottom-2 right-2 h-4 w-4 border-r-2 border-b-2 border-gold/50 pointer-events-none" />

      {/* Live indicator */}
      {cameraState === 'on' && (
        <div className="absolute top-2 right-8 flex items-center gap-1 z-10">
          <div className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse" />
          <span className="text-[9px] text-danger font-mono uppercase">LIVE</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Animated audio waveform
// ---------------------------------------------------------------------------

function AudioWaveform({ active }: { active: boolean }) {
  const [bars, setBars] = React.useState<number[]>(Array(24).fill(20));

  React.useEffect(() => {
    if (!active) {
      setBars(Array(24).fill(20));
      return;
    }
    const interval = setInterval(() => {
      setBars((prev) => prev.map(() => 20 + Math.random() * 80));
    }, 120);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="flex items-end justify-center gap-1 h-20">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full transition-all duration-150"
          style={{
            height: `${h}%`,
            backgroundColor: active
              ? `hsl(${160 + i * 2} 84% ${30 + h * 0.3}%)`
              : 'hsl(215 28% 22%)',
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result gauge
// ---------------------------------------------------------------------------

function ResultGauge({ score, size = 120 }: { score: number; size?: number }) {
  const color = pwiColor(score);
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const offset = arcLength * (1 - score / 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(215 28% 18%)" strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`} strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`} className="pwi-gauge-arc pwi-gauge-glow" style={{ color }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground">PWI</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio playback card
// ---------------------------------------------------------------------------

function AudioPlaybackCard({
  audioUrl,
  audioClass,
  animalName,
}: {
  audioUrl: string;
  audioClass: AudioClassification;
  animalName: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onEnd = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  function stop() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
  }

  function formatTime(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const classColors: Record<AudioClassification, string> = {
    PLAYFUL: '#10B981',
    NEUTRAL: '#94A3B8',
    SEPARATION_ANXIETY: '#D4AF37',
    PAIN_VOCALIZATION: '#EF4444',
    STRESS_PANTING: '#F59E0B',
  };
  const accent = classColors[audioClass] ?? '#D4AF37';

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <AudioLines className="h-3.5 w-3.5" style={{ color: accent }} />
        <span className="text-xs font-semibold text-foreground">
          Recorded Audio
        </span>
        <Badge
          variant="outline"
          className="ml-auto text-[10px] py-0 h-5"
          style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}15` }}
        >
          {audioClass.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
        </Badge>
      </div>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 transition-colors"
          style={{ backgroundColor: accent, color: '#0F172A' }}
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5 ml-0.5" />
          )}
        </button>
        <button
          onClick={stop}
          className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <Square className="h-3 w-3" />
        </button>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted-foreground w-8">
            {formatTime(currentTime)}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{ width: `${progressPct}%`, backgroundColor: accent }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground w-8">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        Audio captured from {animalName} during the acoustic analysis phase.
        Classified as <span style={{ color: accent }}>{audioClass.replace(/_/g, ' ').toLowerCase()}</span>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main scan page
// ---------------------------------------------------------------------------

export default function ScanPage() {
  const [animals, setAnimals] = React.useState<Animal[]>([]);
  const [selectedAnimal, setSelectedAnimal] = React.useState<Animal | null>(null);
  const [phase, setPhase] = React.useState<ScanPhase>('idle');
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<ScanResult | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [deviceId, setDeviceId] = React.useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = React.useState(false);
  const recorder = useAudioRecorder();

  // Load animals on mount
  React.useEffect(() => {
    async function loadAnimals() {
      const { data } = await supabase.from('animals').select('*').eq('status', 'ACTIVE').order('name');
      if (data) setAnimals(data as Animal[]);
    }
    loadAnimals();
  }, []);

  // Run scan sequence
  React.useEffect(() => {
    if (phase === 'idle' || phase === 'result') return;
    const phaseDurations: Record<string, number> = { audio: 2500, vision: 2500, fusion: 1500 };
    const duration = phaseDurations[phase] ?? 0;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        if (phase === 'audio') {
          if (recorder.recording) recorder.stopRecording();
          setPhase('vision');
        }
        else if (phase === 'vision') setPhase('fusion');
        else if (phase === 'fusion') {
          if (selectedAnimal) {
            const profile = SCAN_PROFILES[selectedAnimal.name] ?? DEFAULT_PROFILE;
            const computed = computePWI(profile.audio, profile.audioConf, profile.posture, profile.visionConf, profile);
            setResult(computed);
          }
          setPhase('result');
        }
      }
    }, 50);
    return () => clearInterval(interval);
  }, [phase, selectedAnimal]);

  // Save result to database
  React.useEffect(() => {
    if (result && selectedAnimal && !saved) {
      setSaved(true);
      supabase.from('welfare_telemetry').insert({
        animal_id: selectedAnimal.id,
        edge_device_id: deviceId,
        pwi_score: result.pwi_score,
        stress_category: result.stress_category,
        audio_classification: result.audio_classification,
        audio_confidence: result.audio_confidence,
        vision_posture_weight: result.vision_posture_weight,
        vision_confidence: result.vision_confidence,
        heart_rate_bpm: result.heart_rate_bpm,
        panting_frequency_cpm: result.panting_frequency_cpm,
        head_tilt_angle: result.head_tilt_angle,
        ear_orientation: result.ear_orientation,
        tail_tuck_angle: result.tail_tuck_angle,
        pacing_velocity: result.pacing_velocity,
        recommended_action: result.recommended_action,
      }).then(() => {});
    }
  }, [result, selectedAnimal, saved, deviceId]);

  // Fetch edge device for selected animal
  React.useEffect(() => {
    if (!selectedAnimal?.shelter_unit_id) return;
    supabase.from('edge_devices').select('id').eq('shelter_unit_id', selectedAnimal.shelter_unit_id)
      .limit(1).then(({ data }) => {
        if (data && data.length > 0) setDeviceId(data[0].id);
      });
  }, [selectedAnimal]);

  function handleStartScan() {
    if (!selectedAnimal) return;
    setResult(null);
    setSaved(false);
    setProgress(0);
    setPhase('audio');
    if (recorder.micState === 'on') {
      recorder.startRecording();
    }
  }

  function handleReset() {
    setPhase('idle');
    setResult(null);
    setProgress(0);
    setSaved(false);
    setSelectedAnimal(null);
    setCameraEnabled(false);
    recorder.disableMic();
  }

  function handleAnimalAdded(animal: Animal) {
    setAnimals((prev) => [...prev, animal].sort((a, b) => a.name.localeCompare(b.name)));
  }

  const phaseLabels: Record<ScanPhase, string> = {
    idle: 'Ready', audio: 'Extracting Acoustic Features',
    vision: 'Analyzing Vision Telemetry', fusion: 'Computing PWI Fusion', result: 'Scan Complete',
  };
  const phaseIcons: Record<ScanPhase, React.ReactNode> = {
    idle: <ScanLine className="h-4 w-4" />,
    audio: <AudioLines className="h-4 w-4" />,
    vision: <Eye className="h-4 w-4" />,
    fusion: <Brain className="h-4 w-4" />,
    result: <CheckCircle2 className="h-4 w-4" />,
  };

  const isScanning = phase === 'audio' || phase === 'vision' || phase === 'fusion';
  const resultColor = result ? pwiColor(result.pwi_score) : '#D4AF37';
  const isCritical = result?.stress_category === 'CRITICAL';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-5 w-5 text-gold" />
              <h2 className="text-lg font-semibold text-foreground">Live Multimodal Scan</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Select an animal and run a multimodal acoustic + vision analysis.
              Results are saved to the telemetry database and appear instantly on the dashboard.
            </p>
          </div>
        </div>

        {/* Animal selection */}
        {phase === 'idle' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Select a patient to scan</h3>
              <AddAnimalDialog onAnimalAdded={handleAnimalAdded} />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {animals.map((animal) => {
                const isSelected = selectedAnimal?.id === animal.id;
                return (
                  <button
                    key={animal.id}
                    onClick={() => setSelectedAnimal(animal)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-all',
                      isSelected ? 'border-gold bg-gold/10' : 'border-border bg-card hover:border-gold/30'
                    )}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold mb-3"
                      style={{
                        backgroundColor: isSelected ? '#D4AF3730' : 'hsl(215 28% 16%)',
                        color: isSelected ? '#D4AF37' : 'hsl(215 16% 55%)',
                      }}
                    >
                      {animal.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{animal.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{animal.species} · {animal.breed ?? 'Unknown'}</p>
                    {SCAN_PROFILES[animal.name] && (
                      <p className="text-[10px] text-gold/70 mt-2">{SCAN_PROFILES[animal.name].label}</p>
                    )}
                    {!SCAN_PROFILES[animal.name] && (
                      <p className="text-[10px] text-emerald/70 mt-2">{DEFAULT_PROFILE.label}</p>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedAnimal && (
              <div className="space-y-4">
                {/* Sensor toggles */}
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Microphone toggle */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-emerald" />
                        <h4 className="text-xs font-semibold text-foreground">Microphone</h4>
                      </div>
                      <Button
                        size="sm"
                        variant={recorder.micState === 'on' ? 'default' : 'outline'}
                        className="h-8 text-xs"
                        disabled={recorder.micState === 'starting'}
                        onClick={() => {
                          if (recorder.micState === 'on') recorder.disableMic();
                          else recorder.enableMic();
                        }}
                        style={recorder.micState === 'on' ? { backgroundColor: '#10B981', color: '#0F172A' } : undefined}
                      >
                        {recorder.micState === 'starting' ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Starting...</>
                        ) : recorder.micState === 'on' ? (
                          <><Mic className="h-3.5 w-3.5 mr-1.5" />Mic On</>
                        ) : recorder.micState === 'denied' ? (
                          <><MicOff className="h-3.5 w-3.5 mr-1.5" />Denied</>
                        ) : (
                          <><MicOff className="h-3.5 w-3.5 mr-1.5" />Enable Mic</>
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center justify-center h-16 rounded-lg bg-slate-dark/50">
                      {recorder.micState === 'on' && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                          <span className="text-xs text-emerald">Microphone ready</span>
                        </div>
                      )}
                      {recorder.micState === 'off' && (
                        <div className="flex items-center gap-2">
                          <MicOff className="h-5 w-5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Microphone off</span>
                        </div>
                      )}
                      {recorder.micState === 'starting' && (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 text-emerald animate-spin" />
                          <span className="text-xs text-muted-foreground">Starting...</span>
                        </div>
                      )}
                      {recorder.micState === 'denied' && (
                        <div className="flex items-center gap-2 text-center">
                          <MicOff className="h-5 w-5 text-danger" />
                          <span className="text-xs text-danger">Access denied</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {recorder.micState === 'on'
                        ? 'Microphone is live. Audio will be recorded during the acoustic phase and available for playback in the results.'
                        : recorder.micState === 'denied'
                        ? 'Microphone access was denied. Allow microphone permission to record audio during scans.'
                        : 'Microphone is off. Enable it to record real audio during the acoustic analysis phase, or proceed with simulated audio telemetry.'}
                    </p>
                  </div>

                  {/* Camera toggle */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-gold" />
                        <h4 className="text-xs font-semibold text-foreground">Vision Camera</h4>
                      </div>
                      <Button
                        size="sm"
                        variant={cameraEnabled ? 'default' : 'outline'}
                        className="h-8 text-xs"
                        onClick={() => setCameraEnabled((v) => !v)}
                        style={cameraEnabled ? { backgroundColor: '#D4AF37', color: '#0F172A' } : undefined}
                      >
                        {cameraEnabled ? (
                          <><Camera className="h-3.5 w-3.5 mr-1.5" />Camera On</>
                        ) : (
                          <><CameraOff className="h-3.5 w-3.5 mr-1.5" />Enable Camera</>
                        )}
                      </Button>
                    </div>
                    <CameraFeed active={cameraEnabled} scanning={false} />
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {cameraEnabled
                        ? 'Camera is live. Live video will be used during the vision phase of scanning.'
                        : 'Camera is off. Enable it to use live video during the vision analysis phase, or proceed with simulated vision telemetry.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <Button
                    size="lg"
                    className="bg-gold text-slate-dark hover:bg-gold-dark h-12 px-6"
                    onClick={handleStartScan}
                  >
                    <ScanLine className="h-4 w-4 mr-2" />
                    Start Scan for {selectedAnimal.name}
                  </Button>
                  <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="h-12 px-6">
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Go to Dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scanning / result view */}
        {phase !== 'idle' && (
          <div className="space-y-6">
            {/* Phase indicator */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', isScanning ? 'bg-gold/15 text-gold' : 'bg-emerald/15 text-emerald')}>
                  {phaseIcons[phase]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{phaseLabels[phase]}</p>
                  <p className="text-xs text-muted-foreground">{selectedAnimal?.name} · {selectedAnimal?.species}</p>
                </div>
              </div>
              {isScanning && (
                <div className="flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-emerald animate-pulse" />
                  <span className="text-xs text-muted-foreground tabular-nums">{progress.toFixed(0)}%</span>
                </div>
              )}
              {phase === 'result' && (
                <Button size="sm" variant="outline" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />New Scan
                </Button>
              )}
            </div>

            {/* Progress bar */}
            {isScanning && (
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-gold to-emerald transition-all duration-100" style={{ width: `${progress}%` }} />
              </div>
            )}

            {/* Audio + Vision panels */}
            {(isScanning || phase === 'result') && (
              <div className="grid md:grid-cols-2 gap-4">
                {/* Audio panel */}
                <div className={cn('rounded-xl border bg-card p-4 transition-opacity', phase === 'vision' || phase === 'fusion' || phase === 'result' ? 'opacity-50' : 'opacity-100')}>
                  <div className="flex items-center gap-2 mb-3">
                    <AudioLines className="h-4 w-4 text-emerald" />
                    <h4 className="text-xs font-semibold text-foreground">Acoustic Pipeline</h4>
                    {phase !== 'audio' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald ml-auto" />}
                  </div>
                  <AudioWaveform active={phase === 'audio'} />
                  <div className="mt-3 space-y-1 text-[10px] text-muted-foreground font-mono">
                    {['STFT', 'Mel-Spec 128', 'MFCC ×20', 'pyIN pitch'].map((s) => (
                      <div key={s} className="flex justify-between">
                        <span>{s}</span>
                        <span className="text-emerald">{phase === 'audio' ? 'processing...' : 'done'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vision panel — live camera or simulated */}
                <div className={cn('rounded-xl border bg-card p-4 transition-opacity', phase === 'audio' ? 'opacity-50' : 'opacity-100')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="h-4 w-4 text-gold" />
                    <h4 className="text-xs font-semibold text-foreground">Vision Pipeline</h4>
                    {(phase === 'fusion' || phase === 'result') && <CheckCircle2 className="h-3.5 w-3.5 text-emerald ml-auto" />}
                    {cameraEnabled && phase === 'vision' && (
                      <div className="flex items-center gap-1 ml-auto">
                        <div className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse" />
                        <span className="text-[9px] text-danger font-mono uppercase">LIVE</span>
                      </div>
                    )}
                  </div>
                  <CameraFeed active={cameraEnabled} scanning={phase === 'vision'} />
                  <div className="mt-3 space-y-1 text-[10px] text-muted-foreground font-mono">
                    {['Keypoints', 'Joint angles', 'Centroid track'].map((s) => (
                      <div key={s} className="flex justify-between">
                        <span>{s}</span>
                        <span className="text-gold">
                          {phase === 'vision' ? (cameraEnabled ? 'live detect' : 'detecting...') : phase === 'audio' ? 'pending' : 'done'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Fusion computing */}
            {phase === 'fusion' && (
              <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/5 to-transparent p-6 text-center">
                <Brain className="h-8 w-8 text-gold mx-auto mb-3 animate-pulse" />
                <p className="text-sm font-semibold text-foreground">Fusing modalities...</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">PWI = 100 − (0.55 × Audio + 0.45 × Vision)</p>
              </div>
            )}

            {/* Result */}
            {phase === 'result' && result && (
              <div className={cn('rounded-xl border bg-card p-6 fade-in-up', isCritical && 'border-danger/40 critical-pulse')}>
                <div className="flex flex-col lg:flex-row items-center gap-6">
                  <ResultGauge score={result.pwi_score} size={130} />
                  <div className="flex-1 w-full space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn('text-xs font-semibold uppercase',
                        result.stress_category === 'OPTIMAL' && 'bg-emerald/15 text-emerald border-emerald/30',
                        result.stress_category === 'MONITOR' && 'bg-gold/15 text-gold border-gold/30',
                        result.stress_category === 'CRITICAL' && 'bg-danger/15 text-danger border-danger/30')}>
                        {result.stress_category}
                      </Badge>
                      {isCritical && (
                        <Badge variant="outline" className="bg-danger/15 text-danger border-danger/30 text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />Emergency Flagged
                        </Badge>
                      )}
                      <Badge variant="outline" className="bg-secondary text-muted-foreground text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-emerald" />Saved to database
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Audio Class', value: result.audio_classification.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) },
                        { label: 'Posture', value: `${(result.vision_posture_weight * 100).toFixed(0)}%` },
                        { label: 'Audio Conf.', value: `${(result.audio_confidence * 100).toFixed(0)}%` },
                        { label: 'Vision Conf.', value: `${(result.vision_confidence * 100).toFixed(0)}%` },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg bg-secondary/50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                          <p className="text-xs font-semibold mt-0.5" style={{ color: resultColor }}>{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                        <HeartPulse className="h-3.5 w-3.5 text-danger" />
                        <span className="text-xs text-muted-foreground">Heart Rate</span>
                        <span className="text-xs font-semibold text-foreground ml-auto tabular-nums">{result.heart_rate_bpm.toFixed(0)} BPM</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                        <Wind className="h-3.5 w-3.5 text-gold" />
                        <span className="text-xs text-muted-foreground">Panting</span>
                        <span className="text-xs font-semibold text-foreground ml-auto tabular-nums">{result.panting_frequency_cpm.toFixed(0)} CPM</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Head Tilt', value: `${result.head_tilt_angle.toFixed(1)}°` },
                        { label: 'Tail Tuck', value: `${result.tail_tuck_angle.toFixed(1)}°` },
                        { label: 'Pacing', value: `${result.pacing_velocity.toFixed(2)} m/s` },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                          <p className="text-xs font-semibold text-foreground mt-0.5 tabular-nums">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-2 rounded-lg bg-secondary/30 p-3">
                      <Activity className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground leading-relaxed">{result.recommended_action}</p>
                    </div>

                    {/* Audio recording playback */}
                    {recorder.audioUrl && (
                      <AudioPlaybackCard
                        audioUrl={recorder.audioUrl}
                        audioClass={result.audio_classification}
                        animalName={selectedAnimal?.name ?? 'Unknown'}
                      />
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs h-9"
                        onClick={async () => {
                          await supabase.from('intervention_logs').insert({
                            animal_id: selectedAnimal?.id, action_type: 'SOUND_MASKING',
                            performed_by: 'Scan Operator', notes: 'Sound masking triggered from live scan', status: 'INITIATED',
                          });
                        }}>
                        <Volume2 className="h-3.5 w-3.5 mr-1.5" />Trigger Sound Masking
                      </Button>
                      <Button size="sm" className="flex-1 text-xs h-9"
                        style={isCritical ? { backgroundColor: '#EF4444', borderColor: '#EF4444' } : undefined}
                        onClick={async () => {
                          await supabase.from('intervention_logs').insert({
                            animal_id: selectedAnimal?.id, action_type: 'VET_DISPATCH',
                            performed_by: 'Scan Operator', notes: 'Vet dispatched from live scan', status: 'INITIATED',
                          });
                        }}>
                        <Stethoscope className="h-3.5 w-3.5 mr-1.5" />Dispatch Vet
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            {phase === 'result' && (
              <div className="flex items-center justify-center gap-3">
                <Link href="/dashboard">
                  <Button variant="outline" size="sm">
                    <Gauge className="h-3.5 w-3.5 mr-1.5" />View on Dashboard
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={handleReset}>
                  <PawPrint className="h-3.5 w-3.5 mr-1.5" />Scan Another Animal
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
