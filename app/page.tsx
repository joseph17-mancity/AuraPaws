'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  PawPrint,
  AudioLines,
  Eye,
  Brain,
  Activity,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Radio,
  Stethoscope,
  Volume2,
  Zap,
  HeartPulse,
  ScanLine,
  LayoutDashboard,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navbar } from '@/components/Navbar';

const HERO_IMAGE =
  'https://images.pexels.com/photos/6235114/pexels-photo-6235114.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
const SHELTER_IMAGE =
  'https://images.pexels.com/photos/1350563/pexels-photo-1350563.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
const CAT_IMAGE =
  'https://images.pexels.com/photos/6816862/pexels-photo-6816862.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-gold/5 via-transparent to-transparent" />
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-15"
            style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-background/60" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-6">
              <Badge
                variant="outline"
                className="bg-gold/10 text-gold border-gold/30 text-xs"
              >
                <Zap className="h-3 w-3 mr-1" />
                Multimodal AI Engine
              </Badge>
              <Badge
                variant="outline"
                className="bg-emerald/10 text-emerald border-emerald/30 text-xs"
              >
                <Radio className="h-3 w-3 mr-1" />
                Real-time Telemetry
              </Badge>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
              Detecting animal distress{' '}
              <span className="text-gold">before</span> it shows.
            </h1>

            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">
              AuraPaws processes real-time acoustic and vision telemetry from
              shelter edge devices to compute a Predictive Welfare Index —
              flagging non-verbal distress the moment it begins, so veterinary
              staff can intervene before it escalates.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/scan">
                <Button
                  size="lg"
                  className="bg-gold text-slate-dark hover:bg-gold-dark h-12 px-6 text-sm font-semibold"
                >
                  <ScanLine className="h-4 w-4 mr-2" />
                  Start Live Scan
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-sm font-semibold border-border"
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  View Dashboard
                </Button>
              </Link>
            </div>

            <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald" />
                <span>5 vocalization classes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-gold" />
                <span>4 posture metrics</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-emerald" />
                <span>CNN + MLP fusion</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Animals Monitored', value: '4', icon: PawPrint, color: 'text-gold' },
              { label: 'Telemetry Readings', value: '80+', icon: Activity, color: 'text-emerald' },
              { label: 'Edge Devices Online', value: '4', icon: Radio, color: 'text-gold' },
              { label: 'Active Alerts', value: '1', icon: AlertTriangle, color: 'text-danger' },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pipeline section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            Two senses. One welfare score.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto">
            The AuraPaws inference engine fuses acoustic and vision signals
            into a single Predictive Welfare Index using a weighted formula.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Audio pipeline */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald/15">
                <AudioLines className="h-5 w-5 text-emerald" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Acoustic Pipeline
                </h3>
                <p className="text-xs text-muted-foreground">5-second PCM buffers · 16kHz mono</p>
              </div>
            </div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {[
                'STFT & 128-band Mel-spectrogram',
                'Top-20 MFCCs + spectral centroid',
                'Zero-crossing rate analysis',
                'pyIN pitch contours for frequency spike detection',
                'CNN classifier: Playful · Neutral · Anxiety · Pain · Panting',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full bg-emerald shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Vision pipeline */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/15">
                <Eye className="h-5 w-5 text-gold" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Vision Pipeline
                </h3>
                <p className="text-xs text-muted-foreground">1080p RTSP frames · OpenCV</p>
              </div>
            </div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {[
                'Keypoint detection for joint angle computation',
                'Head-tilt angle & ear orientation',
                'Tail-tuck angle relative to spine',
                'Bounding-box centroid tracking for pacing velocity',
                'MLP posture classifier: 0.0 (relaxed) → 1.0 (distress)',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full bg-gold shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* PWI formula card */}
        <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/5 to-transparent p-6">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gold mb-2">
                Predictive Welfare Index (PWI)
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The fusion formula combines both modalities into a single
                0–100 score. Higher means better welfare. Scores below 50
                trigger an automatic emergency flag.
              </p>
            </div>
            <div className="rounded-lg bg-slate-dark/80 px-6 py-4 font-mono text-sm text-center">
              <span className="text-emerald">PWI</span>
              <span className="text-muted-foreground"> = </span>
              <span className="text-foreground">100</span>
              <span className="text-muted-foreground"> − [</span>
              <span className="text-gold">0.55</span>
              <span className="text-muted-foreground"> × Audio</span>
              <span className="text-muted-foreground"> + </span>
              <span className="text-gold">0.45</span>
              <span className="text-muted-foreground"> × Vision</span>
              <span className="text-muted-foreground">] × 100</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-12">
            Everything a welfare team needs
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: HeartPulse,
                title: 'Live Radial Gauges',
                desc: 'Each patient card displays a color-shifting SVG gauge — green above 75, gold 50–75, red below 50.',
                color: 'text-emerald',
              },
              {
                icon: Activity,
                title: 'Sparkline Vitals',
                desc: 'Heart rate (BPM) and panting frequency (CPM) sparklines update in real time as new telemetry arrives.',
                color: 'text-danger',
              },
              {
                icon: Radio,
                title: 'WebSocket Realtime',
                desc: 'Supabase Realtime broadcasts every new telemetry insert to subscribed dashboard cards instantly.',
                color: 'text-gold',
              },
              {
                icon: AlertTriangle,
                title: 'Emergency Auto-Flag',
                desc: 'A database trigger automatically marks any PWI below 50 as critical and broadcasts an alert.',
                color: 'text-danger',
              },
              {
                icon: Volume2,
                title: 'Sound Masking',
                desc: 'Trigger sound-masking actuators directly from the monitoring card with a single click.',
                color: 'text-emerald',
              },
              {
                icon: Stethoscope,
                title: 'Vet Dispatch',
                desc: 'Log an intervention and dispatch veterinary staff to the animal\u2019s kennel in one action.',
                color: 'text-gold',
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border border-border bg-card p-5 hover:border-gold/30 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary mb-3">
                    <Icon className={`h-5 w-5 ${feature.color}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Image showcase */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="relative rounded-xl overflow-hidden h-64">
            <img
              src={SHELTER_IMAGE}
              alt="Shelter dog"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-dark via-slate-dark/40 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <Badge className="bg-gold/90 text-slate-dark border-0">
                Shelter Monitoring
              </Badge>
              <p className="text-sm text-foreground mt-2 max-w-xs">
                Edge devices stream audio and video from every kennel unit.
              </p>
            </div>
          </div>
          <div className="relative rounded-xl overflow-hidden h-64">
            <img
              src={CAT_IMAGE}
              alt="Veterinary cat care"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-dark via-slate-dark/40 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <Badge className="bg-emerald/90 text-slate-dark border-0">
                Post-Surgery Recovery
              </Badge>
              <p className="text-sm text-foreground mt-2 max-w-xs">
                Pain vocalizations and posture changes flagged automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/8 to-transparent p-8 lg:p-12 text-center">
            <PawPrint className="h-10 w-10 text-gold mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
              Ready to monitor your shelter?
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
              Run a live multimodal scan on any animal or jump straight to the
              dashboard to see all active patients and their real-time PWI scores.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/scan">
                <Button size="lg" className="bg-gold text-slate-dark hover:bg-gold-dark h-12 px-6">
                  <ScanLine className="h-4 w-4 mr-2" />
                  Start Live Scan
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="h-12 px-6">
                  Open Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <PawPrint className="h-4 w-4 text-gold" />
              <span className="text-xs text-muted-foreground">
                AuraPaws — Automated Welfare Monitoring
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              PWI = 100 − (0.55 × Audio + 0.45 × Vision) · Multimodal Inference Engine
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
