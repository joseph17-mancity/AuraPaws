"""
AuraPaws Inference Server — FastAPI application for real-time PWI scoring.

Endpoints:
  POST /analyze       — Accept raw audio + vision data, return PWI payload
  POST /analyze/batch  — Accept a batch of readings
  GET  /health         — Health check
  GET  /classes        — List supported vocalization classes

The server loads the AcousticClassifier and PoseClassifier, runs inference,
computes the PWI fusion formula, and optionally persists results to Supabase.
"""

from __future__ import annotations

import os
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from feature_extractor import AuraPawsFeatureExtractor
from models import (
    AUDIO_DISTRESS_WEIGHTS,
    VOCALIZATION_CLASSES,
    AcousticClassifier,
    PoseClassifier,
    compute_pwi,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "weights")
N_MELS = 128


# ---------------------------------------------------------------------------
# Models (Pydantic schemas)
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    animal_id: str = Field(..., description="UUID of the animal")
    edge_device_id: Optional[str] = Field(None, description="UUID of the capturing device")
    audio_buffer: Optional[str] = Field(
        None,
        description="Base64-encoded 16-bit PCM mono audio (5s @ 16kHz)",
    )
    vision_frames: Optional[list[list[list[float]]]] = Field(
        None,
        description="List of frames as 2D pixel arrays (grayscale, float 0-255)",
    )


class ConfidenceScores(BaseModel):
    audio: float
    vision: float


class PWIResponse(BaseModel):
    animal_id: str
    pwi_score: int
    stress_category: str
    confidence_scores: ConfidenceScores
    recommended_action: str
    audio_classification: str
    vision_posture_weight: float
    heart_rate_bpm: Optional[float] = None
    panting_frequency_cpm: Optional[float] = None
    head_tilt_angle: Optional[float] = None
    ear_orientation: Optional[float] = None
    tail_tuck_angle: Optional[float] = None
    pacing_velocity: Optional[float] = None


class BatchRequest(BaseModel):
    readings: list[AnalyzeRequest]


class HealthResponse(BaseModel):
    status: str
    device: str
    models_loaded: bool


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

_extractor = AuraPawsFeatureExtractor()
_acoustic_model: Optional[AcousticClassifier] = None
_pose_model: Optional[PoseClassifier] = None


def _load_models() -> None:
    """Load model weights from disk, or initialize fresh weights for inference."""
    global _acoustic_model, _pose_model

    _acoustic_model = AcousticClassifier(n_mels=N_MELS, num_classes=len(VOCALIZATION_CLASSES))
    _pose_model = PoseClassifier(input_dim=4)

    acoustic_path = os.path.join(MODELS_DIR, "acoustic_classifier.pt")
    pose_path = os.path.join(MODELS_DIR, "pose_classifier.pt")

    if os.path.exists(acoustic_path):
        _acoustic_model.load_state_dict(torch.load(acoustic_path, map_location=DEVICE))
    if os.path.exists(pose_path):
        _pose_model.load_state_dict(torch.load(pose_path, map_location=DEVICE))

    _acoustic_model.to(DEVICE).eval()
    _pose_model.to(DEVICE).eval()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_models()
    yield


app = FastAPI(
    title="AuraPaws Inference Server",
    description="Real-time multimodal animal welfare scoring",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

def _classify_audio(mel_spec_db: np.ndarray) -> tuple[str, float]:
    """Run the acoustic classifier on a mel-spectrogram.

    Returns (predicted_class_name, confidence).
    """
    if _acoustic_model is None:
        raise RuntimeError("Acoustic model not loaded")

    # Normalize to [0, 1] and add channel + batch dims
    mel = (mel_spec_db - mel_spec_db.min()) / (mel_spec_db.max() - mel_spec_db.min() + 1e-8)
    tensor = torch.from_numpy(mel).float().unsqueeze(0).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits = _acoustic_model(tensor)
        probs = torch.softmax(logits, dim=1)
        conf, pred_idx = probs.max(dim=1)

    return VOCALIZATION_CLASSES[pred_idx.item()], conf.item()


def _classify_pose(features: np.ndarray) -> tuple[float, float]:
    """Run the pose classifier on a 4-D feature vector.

    Returns (posture_weight, confidence).
    """
    if _pose_model is None:
        raise RuntimeError("Pose model not loaded")

    tensor = torch.from_numpy(features).float().unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        weight = _pose_model(tensor)
        # Confidence: distance from 0.5 decision boundary, scaled to [0, 1]
        raw_conf = abs(float(weight.item()) - 0.5) * 2
        confidence = min(1.0, max(0.0, raw_conf + 0.5))

    return float(weight.item()), confidence


def _estimate_vitals(audio_features, vision_features) -> dict:
    """Estimate heart rate (BPM) and panting frequency (CPM) from features.

    These are derived estimates from acoustic and motion features.
    """
    # Heart rate: correlated with pitch variability and RMS energy
    base_hr = 80.0
    hr_component = audio_features.pitch_variability * 15 + audio_features.rms_energy * 40
    heart_rate = base_hr + hr_component

    # Panting frequency: correlated with ZCR and pacing velocity
    base_panting = 10.0
    panting_component = audio_features.zero_crossing_rate.mean() * 50 + vision_features.pacing_velocity * 0.02
    panting_frequency = base_panting + panting_component

    return {
        "heart_rate_bpm": round(heart_rate, 1),
        "panting_frequency_cpm": round(panting_frequency, 1),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        device=str(DEVICE),
        models_loaded=_acoustic_model is not None and _pose_model is not None,
    )


@app.get("/classes")
async def get_classes() -> dict:
    return {
        "vocalization_classes": VOCALIZATION_CLASSES,
        "distress_weights": AUDIO_DISTRESS_WEIGHTS,
    }


@app.post("/analyze", response_model=PWIResponse)
async def analyze(req: AnalyzeRequest) -> PWIResponse:
    """Analyze a single audio+vision reading and return a PWI payload."""
    # Validate animal_id
    try:
        animal_uuid = uuid.UUID(req.animal_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422, detail="Invalid animal_id UUID")

    # --- Audio pipeline ---
    audio_class = "NEUTRAL"
    audio_confidence = 0.5
    audio_features = None

    if req.audio_buffer:
        import base64
        raw_pcm = base64.b64decode(req.audio_buffer)
        audio_features = _extractor.extract_audio_features(raw_pcm)
        audio_class, audio_confidence = _classify_audio(audio_features.mel_spectrogram)

    # --- Vision pipeline ---
    vision_posture_weight = 0.2
    vision_confidence = 0.5
    vision_features = None

    if req.vision_frames:
        frames = [np.array(f, dtype=np.uint8) for f in req.vision_frames]
        vision_features = _extractor.extract_vision_features(frames)
        pose_input = np.array([
            vision_features.head_tilt_angle,
            vision_features.ear_orientation,
            vision_features.tail_tuck_angle,
            vision_features.pacing_velocity,
        ], dtype=np.float32)
        vision_posture_weight, vision_confidence = _classify_pose(pose_input)

    # --- Fusion ---
    pwi_score, stress_category, confidence_scores, recommended_action = compute_pwi(
        audio_class=audio_class,
        audio_confidence=audio_confidence,
        vision_posture_weight=vision_posture_weight,
        vision_confidence=vision_confidence,
    )

    # --- Vital estimates ---
    vitals = {}
    if audio_features and vision_features:
        vitals = _estimate_vitals(audio_features, vision_features)

    return PWIResponse(
        animal_id=str(animal_uuid),
        pwi_score=pwi_score,
        stress_category=stress_category,
        confidence_scores=ConfidenceScores(**confidence_scores),
        recommended_action=recommended_action,
        audio_classification=audio_class,
        vision_posture_weight=round(vision_posture_weight, 4),
        heart_rate_bpm=vitals.get("heart_rate_bpm"),
        panting_frequency_cpm=vitals.get("panting_frequency_cpm"),
        head_tilt_angle=round(vision_features.head_tilt_angle, 2) if vision_features else None,
        ear_orientation=round(vision_features.ear_orientation, 2) if vision_features else None,
        tail_tuck_angle=round(vision_features.tail_tuck_angle, 2) if vision_features else None,
        pacing_velocity=round(vision_features.pacing_velocity, 2) if vision_features else None,
    )


@app.post("/analyze/batch", response_model=list[PWIResponse])
async def analyze_batch(req: BatchRequest) -> list[PWIResponse]:
    """Analyze multiple readings in a single request."""
    return [await analyze(r) for r in req.readings]
