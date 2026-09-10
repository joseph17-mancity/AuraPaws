AuraPaws 🐾✨

Deciphering Non-Verbal Animal Stress via Bio-Acoustics & Computer Vision for Early InterventionAuraPaws is an enterprise-grade, multimodal AI monitoring platform engineered for animal shelters, veterinary clinics, and working-animal facilities. By synthesizing ambient bio-acoustics with edge computer vision posture tracking, AuraPaws translates non-verbal animal signals into a dynamic Predictive Welfare Index (PWI)—enabling proactive intervention before behavioral decline or physiological distress occurs.

📌 Architecture Overview  
                          ┌────────────────────────┐
                          │   Edge RTSP Cameras    │
                          │   & Microphones        │
                          └───────────┬────────────┘
                                      │ (RTSP / PCM Audio)
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      FastAPI Biometric Engine (Python)                    │
│                                                                           │
│   ┌──────────────────────────────┐    ┌──────────────────────────────┐    │
│   │   Audio Pipeline (Librosa)   │    │    Vision Pipeline (YOLO)    │    │
│   │  - MFCC / Spectral Centroid  │    │  - Tail-tuck Angle Tracking  │    │
│   │  - Stress-Panting Detection  │    │  - Ear Pinning / Pose Mesh   │    │
│   └──────────────┬───────────────┘    └──────────────┬───────────────┘    │
│                  │                                   │                    │
│                  └─────────────────┬─────────────────┘                    │
│                                    ▼                                      │
│                      Multimodal Fusion (PWI Model)                        │
│            PWI = 100 - [(0.55 * Audio) + (0.45 * Vision)]                │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼ (PostgreSQL Insert / Webhook)
┌───────────────────────────────────────────────────────────────────────────┐
│                           Supabase Cloud Engine                           │
│     - Row-Level Security (RLS)                                            │
│     - Realtime WebSockets (<50 PWI Trigger)                               │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼ (WebSockets Sub)
┌───────────────────────────────────────────────────────────────────────────┐
│                Next.js 14 Command Center (Tailwind CSS)                   │
│   - Live PWI Gauge     - Sparkline Telemetry    - Incident Action Hub     │
└───────────────────────────────────────────────────────────────────────────┘

🛠️ Tech Stack & Dependencies 

Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide React, Recharts.Inference Engine: Python 3.11+, FastAPI, PyTorch 2.x, OpenCV (opencv-python), Librosa, Scikit-learn. 

Database & Messaging: Supabase (PostgreSQL, Realtime Engine, Row-Level Security). 

Storage & Edge Infrastructure: Backblaze B2 / Supabase Storage for raw media logs.

💡 Predictive Welfare Index (PWI) Formula The system continuously calculates a normalized index $PWI \in [0, 100]$ using a weighted multimodal scoring formula:$$PWI = 100 - \left[ \left(0.55 \times S_{\text{audio}}\right) + \left(0.45 \times S_{\text{vision}}\right) \right]$$$S_{\text{audio}}$: Acoustic distress rating scaled $[0, 100]$, calculated from pitch variance spikes, panting frequency ($\text{CPM}$), and vocalization spectral entropy.$S_{\text{vision}}$: Pose distress rating scaled $[0, 100]$, calculated from tail-tuck angles ($<30^\circ$), ear deflection, and pacing velocity vector analysis.Severity Thresholds80–100 (Optimal / Calm): Normal baseline behavior.50–79 (Mild Stress / Monitored): Minor deviation; log for observation.0–49 (Critical Distress): Triggers immediate real-time dashboard alert and automated interventions (e.g., sound masking).

🚀 Quick Start & Installation Prerequisites Node.js v18.x or higher Python 3.11+Supabase CLI or active Supabase cloud project1. 

Database Setup (Supabase)Execute the migration script in your Supabase SQL Editor:

SQL-- Create Shelter Units
CREATE TABLE shelters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  total_units INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Animals
CREATE TABLE animals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id UUID REFERENCES shelters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT NOT NULL,
  age NUMERIC,
  photo_url TEXT,
  baseline_metrics_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telemetry Logs
CREATE TABLE welfare_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID REFERENCES animals(id) ON DELETE CASCADE,
  pwi_score INT CHECK (pwi_score BETWEEN 0 AND 100),
  heart_rate_bpm INT,
  stress_panting_frequency_cpm INT,
  posture_flag TEXT,
  vocalization_flag TEXT,
  raw_payload_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compound Index for Rapid Telemetry Queries
CREATE INDEX idx_telemetry_animal_time ON welfare_telemetry (animal_id, created_at DESC);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE welfare_telemetry;
2. Backend Setup (FastAPI Engine)Bash# Clone repository
git clone https://github.com/your-org/aurapaws.git
cd aurapaws/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Environment variables (.env)
echo "SUPABASE_URL=https://your-supabase-id.supabase.co" >> .env
echo "SUPABASE_KEY=your-supabase-service-role-key" >> .env

# Run FastAPI server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
3. Frontend Setup (Next.js Dashboard)Bashcd ../frontend

# Install node dependencies
npm install

# Environment variables (.env.local)
echo "NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-id.supabase.co" >> .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key" >> .env.local

# Run development server
npm run dev
Open http://localhost:3000 to view the AuraPaws Command Center.📊 API ReferenceProcess Telemetry StreamPOST /api/v1/telemetry/processRequest (Multipart Form Data)animal_id (UUID string)audio_file (PCM WAV chunk)image_frame (JPG/PNG frame)Example Response (200 OK)JSON{
  "status": "success",
  "animal_id": "8f3b2a1c-9012-4d5e-b812-ef3456789abc",
  "pwi_score": 42,
  "stress_category": "CRITICAL",
  "breakdown": {
    "audio_distress_score": 68.5,
    "vision_posture_score": 52.0,
    "detected_vocalization": "SEPARATION_ANXIETY",
    "detected_pose": "TAIL_TUCKED_PACING"
  },
  "recommended_action": "Deploy ambient sound masking; request immediate veterinary technician check."
}
