'use client';

import * as React from 'react';
import { PawPrint, ShieldCheck, AlertTriangle, Activity, Radio } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import {
  Animal,
  WelfareTelemetry,
  ShelterUnit,
  EdgeDevice,
  AnimalWithDetails,
} from '@/lib/types';
import { PatientMonitoringCard } from '@/components/PatientMonitoringCard';
import { Navbar } from '@/components/Navbar';

export default function DashboardPage() {
  const [animals, setAnimals] = React.useState<AnimalWithDetails[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [alertCount, setAlertCount] = React.useState(0);

  React.useEffect(() => {
    async function fetchData() {
      try {
        const { data: animalData, error: animalError } = await supabase
          .from('animals')
          .select('*')
          .eq('status', 'ACTIVE')
          .order('name');

        if (animalError) throw animalError;
        if (!animalData || animalData.length === 0) {
          setLoading(false);
          return;
        }

        const animalsRaw = animalData as Animal[];

        const unitIds = animalsRaw
          .map((a) => a.shelter_unit_id)
          .filter((id): id is string => id !== null);
        const { data: unitsData } = await supabase
          .from('shelter_units')
          .select('*')
          .in('id', unitIds);
        const units = (unitsData ?? []) as ShelterUnit[];
        const unitMap = new Map(units.map((u) => [u.id, u]));

        const { data: devicesData } = await supabase
          .from('edge_devices')
          .select('*')
          .in('shelter_unit_id', unitIds);
        const devices = (devicesData ?? []) as EdgeDevice[];
        const deviceMap = new Map(devices.map((d) => [d.shelter_unit_id, d]));

        const animalIds = animalsRaw.map((a) => a.id);
        const { data: telemetryData } = await supabase
          .from('welfare_telemetry')
          .select('*')
          .in('animal_id', animalIds)
          .order('created_at', { ascending: false })
          .limit(120);

        const allTelemetry = (telemetryData ?? []) as WelfareTelemetry[];

        const telemetryByAnimal = new Map<string, WelfareTelemetry[]>();
        for (const t of allTelemetry) {
          const list = telemetryByAnimal.get(t.animal_id) ?? [];
          list.push(t);
          telemetryByAnimal.set(t.animal_id, list);
        }

        const enriched: AnimalWithDetails[] = animalsRaw.map((a) => {
          const telemetry = telemetryByAnimal.get(a.id) ?? [];
          return {
            ...a,
            shelter_unit: a.shelter_unit_id ? unitMap.get(a.shelter_unit_id) ?? null : null,
            edge_device: a.shelter_unit_id ? deviceMap.get(a.shelter_unit_id) ?? null : null,
            latest_telemetry: telemetry[0] ?? null,
          };
        });

        setAnimals(enriched);

        const alerts = enriched.filter(
          (a) => a.latest_telemetry?.is_emergency ?? false
        );
        setAlertCount(alerts.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
            <p className="text-sm text-muted-foreground">Loading AuraPaws telemetry...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-danger mx-auto" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Status bar */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Patient Monitoring
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time Predictive Welfare Index scores from acoustic and vision telemetry
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-emerald" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald" />
              <span className="text-xs text-muted-foreground">
                {animals.length} monitored
              </span>
            </div>
            {alertCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1">
                <AlertTriangle className="h-3 w-3 text-danger" />
                <span className="text-xs font-semibold text-danger">
                  {alertCount} alert{alertCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {animals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <PawPrint className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mt-4">
              No active animals to monitor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {animals.map((animal) => {
              const telemetry: WelfareTelemetry[] =
                animal.latest_telemetry != null
                  ? [animal.latest_telemetry]
                  : [];
              return (
                <PatientMonitoringCard
                  key={animal.id}
                  animal={animal}
                  telemetryHistory={telemetry}
                />
              );
            })}
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>
            AuraPaws Multimodal Inference Engine · PWI = 100 − (0.55×Audio + 0.45×Vision)
          </span>
        </div>
      </div>
    </div>
  );
}
