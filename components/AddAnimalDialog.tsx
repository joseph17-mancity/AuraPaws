'use client';

import * as React from 'react';
import { Plus, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { Animal, ShelterUnit } from '@/lib/types';

interface AddAnimalDialogProps {
  onAnimalAdded: (animal: Animal) => void;
}

const SPECIES_OPTIONS = ['Canine', 'Feline', 'Avian', 'Lagomorph', 'Reptile', 'Other'];

export function AddAnimalDialog({ onAnimalAdded }: AddAnimalDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shelterUnits, setShelterUnits] = React.useState<ShelterUnit[]>([]);

  const [name, setName] = React.useState('');
  const [species, setSpecies] = React.useState('Canine');
  const [breed, setBreed] = React.useState('');
  const [ageYears, setAgeYears] = React.useState('');
  const [shelterUnitId, setShelterUnitId] = React.useState('');
  const [medicalNotes, setMedicalNotes] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    async function fetchUnits() {
      const { data } = await supabase
        .from('shelter_units')
        .select('*')
        .order('name');
      if (data) setShelterUnits(data as ShelterUnit[]);
    }
    fetchUnits();
  }, [open]);

  function resetForm() {
    setName('');
    setSpecies('Canine');
    setBreed('');
    setAgeYears('');
    setShelterUnitId('');
    setMedicalNotes('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Animal name is required.');
      return;
    }

    setLoading(true);
    setError(null);

    const insertData: Record<string, unknown> = {
      name: name.trim(),
      species,
      breed: breed.trim() || null,
      age_years: ageYears ? parseFloat(ageYears) : null,
      shelter_unit_id: shelterUnitId || null,
      admission_date: new Date().toISOString().split('T')[0],
      medical_notes: medicalNotes.trim() || null,
      status: 'ACTIVE',
    };

    const { data, error: insertError } = await supabase
      .from('animals')
      .insert(insertData)
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    const newAnimal = data as Animal;
    onAnimalAdded(newAnimal);
    resetForm();
    setOpen(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 px-4 text-sm">
          <Plus className="h-4 w-4 mr-2" />
          Register New Animal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register New Animal</DialogTitle>
          <DialogDescription>
            Add a new patient to the AuraPaws monitoring system. The animal
            will be available for scanning immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="animal-name">Name *</Label>
            <Input
              id="animal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daisy"
              required
            />
          </div>

          {/* Species */}
          <div className="space-y-1.5">
            <Label>Species *</Label>
            <Select value={species} onValueChange={setSpecies}>
              <SelectTrigger>
                <SelectValue placeholder="Select species" />
              </SelectTrigger>
              <SelectContent>
                {SPECIES_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Breed */}
          <div className="space-y-1.5">
            <Label htmlFor="animal-breed">Breed</Label>
            <Input
              id="animal-breed"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="e.g. Labrador Retriever"
            />
          </div>

          {/* Age + Shelter unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="animal-age">Age (years)</Label>
              <Input
                id="animal-age"
                type="number"
                min="0"
                step="0.1"
                value={ageYears}
                onChange={(e) => setAgeYears(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shelter Unit</Label>
              <Select value={shelterUnitId} onValueChange={setShelterUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign unit" />
                </SelectTrigger>
                <SelectContent>
                  {shelterUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Medical notes */}
          <div className="space-y-1.5">
            <Label htmlFor="animal-notes">Medical Notes</Label>
            <Textarea
              id="animal-notes"
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              placeholder="Pre-existing conditions, medications, behavioral notes..."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registering...
                </>
              ) : (
                'Register Animal'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
