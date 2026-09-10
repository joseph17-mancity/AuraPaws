"""
AuraPaws model definitions — acoustic and pose classifiers for distress detection.

Acoustic Classifier:
  A lightweight CNN (ResNet-18 inspired) that classifies 5-second mel-spectrograms
  into five vocalization categories: PLAYFUL, NEUTRAL, SEPARATION_ANXIETY,
  PAIN_VOCALIZATION, STRESS_PANTING.

Pose Classifier:
  An MLP that maps a 4-dimensional pose feature vector (head-tilt, ear orientation,
  tail-tuck, pacing velocity) to a scalar posture distress weight in [0, 1].
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# Acoustic Classifier — lightweight CNN for mel-spectrogram classification
# ---------------------------------------------------------------------------

VOCALIZATION_CLASSES = [
    "PLAYFUL",
    "NEUTRAL",
    "SEPARATION_ANXIETY",
    "PAIN_VOCALIZATION",
    "STRESS_PANTING",
]

# Distress weights per class — used in the PWI fusion formula
AUDIO_DISTRESS_WEIGHTS = {
    "PLAYFUL": 0.05,
    "NEUTRAL": 0.20,
    "SEPARATION_ANXIETY": 0.65,
    "PAIN_VOCALIZATION": 0.90,
    "STRESS_PANTING": 0.75,
}


class ConvBlock(nn.Module):
    """Conv2d → BatchNorm → ReLU → MaxPool2d, the basic ResNet-style building block."""

    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1)
        self.bn = nn.BatchNorm2d(out_channels)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pool(F.relu(self.bn(self.conv(x))))


class AcousticClassifier(nn.Module):
    """Lightweight CNN that classifies mel-spectrograms into vocalization categories.

    Input:  (batch, 1, n_mels, time_frames) — single-channel mel-spectrogram
    Output: (batch, 5) — logits over VOCALIZATION_CLASSES
    """

    def __init__(self, n_mels: int = 128, num_classes: int = 5) -> None:
        super().__init__()
        self.features = nn.Sequential(
            ConvBlock(1, 32),
            ConvBlock(32, 64),
            ConvBlock(64, 128),
            ConvBlock(128, 256),
        )
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.gap(x)
        return self.classifier(x)


# ---------------------------------------------------------------------------
# Pose Classifier — MLP for posture distress scoring
# ---------------------------------------------------------------------------

class PoseClassifier(nn.Module):
    """MLP that maps a 4-D pose feature vector to a distress weight in [0, 1].

    Input features: [head_tilt_angle, ear_orientation, tail_tuck_angle, pacing_velocity]
    Output: scalar in [0, 1] — 0 = relaxed posture, 1 = high distress posture
    """

    def __init__(self, input_dim: int = 4) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 32),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(32, 16),
            nn.ReLU(inplace=True),
            nn.Linear(16, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


# ---------------------------------------------------------------------------
# Fusion — Predictive Welfare Index (PWI)
# ---------------------------------------------------------------------------

def compute_pwi(
    audio_class: str,
    audio_confidence: float,
    vision_posture_weight: float,
    vision_confidence: float,
) -> tuple[int, str, dict[str, float], str]:
    """Compute the Predictive Welfare Index from model outputs.

    PWI = 100 - [ (0.55 * Audio_Distress_Weight * 100) + (0.45 * Vision_Posture_Weight * 100) ]

    Args:
        audio_class: One of VOCALIZATION_CLASSES.
        audio_confidence: Model confidence for the audio prediction (0–1).
        vision_posture_weight: Scalar distress weight from the pose model (0–1).
        vision_confidence: Model confidence for the vision prediction (0–1).

    Returns:
        Tuple of (pwi_score, stress_category, confidence_scores, recommended_action).
    """
    audio_weight = AUDIO_DISTRESS_WEIGHTS.get(audio_class, 0.20)

    pwi = 100 - (
        (0.55 * audio_weight * 100) + (0.45 * vision_posture_weight * 100)
    )
    pwi_score = max(0, min(100, int(round(pwi))))

    if pwi_score > 75:
        stress_category = "OPTIMAL"
    elif pwi_score >= 50:
        stress_category = "MONITOR"
    else:
        stress_category = "CRITICAL"

    confidence_scores = {
        "audio": round(audio_confidence, 4),
        "vision": round(vision_confidence, 4),
    }

    if stress_category == "CRITICAL":
        recommended_action = "Immediate vet check required"
    elif stress_category == "MONITOR":
        if audio_class in ("SEPARATION_ANXIETY", "STRESS_PANTING"):
            recommended_action = "Deploy sound masking"
        elif audio_class == "PAIN_VOCALIZATION":
            recommended_action = "Schedule pain assessment"
        else:
            recommended_action = "Continue monitoring"
    else:
        recommended_action = "No action needed — welfare optimal"

    return pwi_score, stress_category, confidence_scores, recommended_action
