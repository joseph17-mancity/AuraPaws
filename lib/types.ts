export type StressCategory = 'OPTIMAL' | 'MONITOR' | 'CRITICAL';

export type AudioClassification =
  | 'PLAYFUL'
  | 'NEUTRAL'
  | 'SEPARATION_ANXIETY'
  | 'PAIN_VOCALIZATION'
  | 'STRESS_PANTING';

export type AnimalStatus = 'ACTIVE' | 'ADOPTED' | 'TRANSFERRED' | 'DECEASED';

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';

export type DeviceType = 'MULTIMODAL' | 'AUDIO_ONLY' | 'VISION_ONLY';

export type InterventionActionType =
  | 'SOUND_MASKING'
  | 'VET_DISPATCH'
  | 'MEDICATION'
  | 'RELOCATION'
  | 'OBSERVATION';

export type InterventionStatus = 'INITIATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ShelterUnit {
  id: string;
  name: string;
  location: string | null;
  capacity: number;
  created_at: string;
}

export interface Animal {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  age_years: number | null;
  shelter_unit_id: string | null;
  admission_date: string | null;
  medical_notes: string | null;
  status: AnimalStatus;
  created_at: string;
}

export interface EdgeDevice {
  id: string;
  shelter_unit_id: string | null;
  device_code: string;
  device_type: DeviceType;
  firmware_version: string | null;
  status: DeviceStatus;
  last_heartbeat_at: string | null;
  created_at: string;
}

export interface WelfareTelemetry {
  id: string;
  animal_id: string;
  edge_device_id: string | null;
  pwi_score: number;
  stress_category: StressCategory;
  audio_classification: AudioClassification | null;
  audio_confidence: number | null;
  vision_posture_weight: number | null;
  vision_confidence: number | null;
  heart_rate_bpm: number | null;
  panting_frequency_cpm: number | null;
  head_tilt_angle: number | null;
  ear_orientation: number | null;
  tail_tuck_angle: number | null;
  pacing_velocity: number | null;
  recommended_action: string | null;
  is_emergency: boolean;
  created_at: string;
}

export interface InterventionLog {
  id: string;
  animal_id: string;
  telemetry_id: string | null;
  action_type: InterventionActionType;
  performed_by: string | null;
  notes: string | null;
  status: InterventionStatus;
  created_at: string;
}

export interface AnimalWithDetails extends Animal {
  shelter_unit?: ShelterUnit | null;
  edge_device?: EdgeDevice | null;
  latest_telemetry?: WelfareTelemetry | null;
}
