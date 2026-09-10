'use client';

import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  Volume2,
  Stethoscope,
  HeartPulse,
  Wind,
  ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AnimalWithDetails,
  WelfareTelemetry,
  StressCategory,
} from '@/lib/types';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// PWI gauge helpers
// ---------------------------------------------------------------------------

function pwiColor(score: number): string {
  if (score > 75) return '#10B981';
  if (score >= 50) return '#D4AF37';
  return '#EF4444';
}

function categoryBadge(category: StressCategory): {
  label: string;
  className: string;
} {
  switch (category) {
    case 'OPTIMAL':
      return {
        label: 'Optimal',
        className: 'bg-emerald/15 text-emerald border-emerald/30',
      };
    case 'MONITOR':
      return {
        label: 'Monitor',
        className: 'bg-gold/15 text-gold border-gold/30',
      };
    case 'CRITICAL':
      return {
        label: 'Critical',
        className: 'bg-danger/15 text-danger border-danger/30',
      };
  }
}

// ---------------------------------------------------------------------------
// Radial SVG Gauge
// ---------------------------------------------------------------------------

interface RadialGaugeProps {
  score: number;
  size?: number;
}

function RadialGauge({ score, size = 160 }: RadialGaugeProps) {
  const color = pwiColor(score);
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // 270-degree arc gauge (leave bottom 90deg open)
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const offset = arcLength * (1 - score / 100);
  const startAngle = 135; // start from bottom-left

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[0deg]">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(215 28% 18%)"
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${size / 2} ${size / 2})`}
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${size / 2} ${size / 2})`}
          className="pwi-gauge-arc pwi-gauge-glow"
          style={{ color }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
          PWI Score
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  label: string;
  unit: string;
  icon: React.ReactNode;
  latest: number | null;
}

function Sparkline({
  data,
  color,
  width = 240,
  height = 50,
  label,
  unit,
  icon,
  latest,
}: SparklineProps) {
  const points = React.useMemo(() => {
    if (data.length < 2) return '';
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    return data
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);

  const areaPath = React.useMemo(() => {
    if (data.length < 2) return '';
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const top = data
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' L');
    return `M0,${height} L${top} L${width},${height} Z`;
  }, [data, width, height]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {latest !== null ? `${latest.toFixed(0)} ${unit}` : '—'}
        </span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill={`url(#grad-${label})`} />}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="sparkline-path"
          />
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface PatientMonitoringCardProps {
  animal: AnimalWithDetails;
  telemetryHistory: WelfareTelemetry[];
}

export function PatientMonitoringCard({
  animal,
  telemetryHistory,
}: PatientMonitoringCardProps) {
  const [telemetry, setTelemetry] = React.useState<WelfareTelemetry[]>(
    telemetryHistory
  );
  const [latest, setLatest] = React.useState<WelfareTelemetry | null>(
    telemetryHistory[0] ?? null
  );
  const [actionLoading, setActionLoading] = React.useState(false);

  // Subscribe to realtime updates for this animal
  React.useEffect(() => {
    const channel = supabase
      .channel(`welfare:${animal.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'welfare_telemetry',
          filter: `animal_id=eq.${animal.id}`,
        },
        (payload) => {
          const newRow = payload.new as WelfareTelemetry;
          setLatest(newRow);
          setTelemetry((prev) => [newRow, ...prev].slice(0, 30));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [animal.id]);

  const pwiScore = latest?.pwi_score ?? 0;
  const color = pwiColor(pwiScore);
  const badge = categoryBadge(latest?.stress_category ?? 'OPTIMAL');
  const isCritical = latest?.is_emergency ?? false;

  const heartRateData = telemetry
    .map((t) => t.heart_rate_bpm)
    .filter((v): v is number => v !== null)
    .reverse();
  const pantingData = telemetry
    .map((t) => t.panting_frequency_cpm)
    .filter((v): v is number => v !== null)
    .reverse();

  async function handleAction(actionType: 'SOUND_MASKING' | 'VET_DISPATCH') {
    setActionLoading(true);
    try {
      await supabase.from('intervention_logs').insert({
        animal_id: animal.id,
        telemetry_id: latest?.id ?? null,
        action_type: actionType,
        performed_by: 'Dashboard Operator',
        notes:
          actionType === 'SOUND_MASKING'
            ? 'Sound masking actuator triggered from monitoring dashboard'
            : 'Veterinary staff dispatched from monitoring dashboard',
        status: 'INITIATED',
      });
    } catch {
      // Surface error to user in production
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden transition-all',
        isCritical && 'border-danger/40 critical-pulse'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {animal.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {animal.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {animal.species} · {animal.breed ?? 'Unknown'} ·{' '}
              {animal.shelter_unit?.name ?? 'Unassigned'}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn('text-[10px] font-semibold uppercase tracking-wide', badge.className)}
        >
          {badge.label}
        </Badge>
      </div>

      <Separator />

      {/* Gauge + vitals */}
      <div className="flex items-center gap-4 p-4">
        <RadialGauge score={pwiScore} size={140} />
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-secondary/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Audio Class
              </p>
              <p className="text-xs font-semibold mt-0.5" style={{ color }}>
                {latest?.audio_classification
                  ?.replace(/_/g, ' ')
                  .toLowerCase()
                  .replace(/\b\w/g, (c) => c.toUpperCase()) ?? '—'}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Posture
              </p>
              <p className="text-xs font-semibold mt-0.5" style={{ color }}>
                {latest?.vision_posture_weight != null
                  ? `${(latest.vision_posture_weight * 100).toFixed(0)}% distress`
                  : '—'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-secondary/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Head Tilt
              </p>
              <p className="text-xs font-semibold mt-0.5 text-foreground">
                {latest?.head_tilt_angle != null
                  ? `${latest.head_tilt_angle.toFixed(1)}°`
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tail Tuck
              </p>
              <p className="text-xs font-semibold mt-0.5 text-foreground">
                {latest?.tail_tuck_angle != null
                  ? `${latest.tail_tuck_angle.toFixed(1)}°`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Sparklines */}
      <div className="p-4 space-y-3">
        <Sparkline
          data={heartRateData}
          color="#EF4444"
          label="Heart Rate"
          unit="BPM"
          icon={<HeartPulse className="h-3 w-3" />}
          latest={latest?.heart_rate_bpm ?? null}
        />
        <Sparkline
          data={pantingData}
          color="#D4AF37"
          label="Panting Freq"
          unit="CPM"
          icon={<Wind className="h-3 w-3" />}
          latest={latest?.panting_frequency_cpm ?? null}
        />
      </div>

      <Separator />

      {/* Confidence bars */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Audio Confidence</span>
          <div className="flex items-center gap-2 flex-1 max-w-[100px] ml-3">
            <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(latest?.audio_confidence ?? 0) * 100}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {((latest?.audio_confidence ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Vision Confidence</span>
          <div className="flex items-center gap-2 flex-1 max-w-[100px] ml-3">
            <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(latest?.vision_confidence ?? 0) * 100}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {((latest?.vision_confidence ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Action panel */}
      <div className="p-4">
        <div className="mb-2 flex items-start gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {latest?.recommended_action ?? 'No data available'}
          </p>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs h-8"
            disabled={actionLoading}
            onClick={() => handleAction('SOUND_MASKING')}
          >
            <Volume2 className="h-3.5 w-3.5 mr-1.5" />
            Sound Masking
          </Button>
          <Button
            size="sm"
            className="flex-1 text-xs h-8"
            disabled={actionLoading}
            onClick={() => handleAction('VET_DISPATCH')}
            style={
              isCritical
                ? { backgroundColor: '#EF4444', borderColor: '#EF4444' }
                : undefined
            }
          >
            <Stethoscope className="h-3.5 w-3.5 mr-1.5" />
            Dispatch Vet
          </Button>
        </div>
      </div>
    </div>
  );
}
