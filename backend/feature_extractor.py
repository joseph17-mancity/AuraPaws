"""
AuraPawsFeatureExtractor — multimodal feature extraction pipeline.

Processes simultaneous audio (5-second PCM buffers, 16kHz mono) and vision
(1080p RTSP video frames) telemetry to produce structured feature vectors
for downstream distress classification.

Audio Pipeline:
  - STFT, Mel-Spectrogram (128 bands), MFCCs (top 20 coefficients)
  - Spectral centroid, zero-crossing rate
  - Pitch contours via librosa.pyin for rapid frequency spike detection

Vision Pipeline:
  - Keypoint detection for joint angle computation
  - Head-tilt, ear orientation, tail-tuck relative to spine
  - Bounding-box centroid tracking for pacing velocity
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Optional

import cv2
import librosa
import numpy as np
from scipy.signal import find_peaks


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------

@dataclass
class AudioFeatures:
    """Structured output of the audio extraction pipeline."""
    stft_magnitude: np.ndarray
    mel_spectrogram: np.ndarray
    mfccs: np.ndarray
    spectral_centroid: np.ndarray
    zero_crossing_rate: np.ndarray
    pitch_contour: np.ndarray
    pitch_variability: float
    frequency_spike_count: int
    rms_energy: float

    def to_dict(self) -> dict:
        return {
            "mfccs_mean": self.mfccs.mean(axis=1).tolist(),
            "spectral_centroid_mean": float(self.spectral_centroid.mean()),
            "zero_crossing_rate_mean": float(self.zero_crossing_rate.mean()),
            "pitch_variability": float(self.pitch_variability),
            "frequency_spike_count": int(self.frequency_spike_count),
            "rms_energy": float(self.rms_energy),
        }


@dataclass
class VisionFeatures:
    """Structured output of the vision extraction pipeline."""
    head_tilt_angle: float
    ear_orientation: float
    tail_tuck_angle: float
    bounding_box_centroids: list[tuple[float, float]] = field(default_factory=list)
    pacing_velocity: float = 0.0

    def to_dict(self) -> dict:
        return {
            "head_tilt_angle": float(self.head_tilt_angle),
            "ear_orientation": float(self.ear_orientation),
            "tail_tuck_angle": float(self.tail_tuck_angle),
            "pacing_velocity": float(self.pacing_velocity),
        }


# ---------------------------------------------------------------------------
# Feature Extractor
# ---------------------------------------------------------------------------

class AuraPawsFeatureExtractor:
    """Modular multimodal feature extractor for animal distress detection."""

    SAMPLE_RATE = 16000
    BUFFER_DURATION = 5.0
    N_MEL_BANDS = 128
    N_MFCC = 20
    N_FFT = 2048
    HOP_LENGTH = 512

    def __init__(self, sample_rate: int = SAMPLE_RATE) -> None:
        self.sample_rate = sample_rate

    # ---- Audio pipeline --------------------------------------------------

    def extract_audio_features(self, audio_buffer: bytes) -> AudioFeatures:
        """Process a 5-second PCM-16 mono audio buffer.

        Args:
            audio_buffer: Raw 16-bit little-endian PCM mono samples.

        Returns:
            AudioFeatures containing all computed acoustic descriptors.
        """
        samples = self._bytes_to_pcm(audio_buffer)

        # Pad / truncate to exactly 5 seconds
        target_len = int(self.SAMPLE_RATE * self.BUFFER_DURATION)
        if len(samples) < target_len:
            samples = np.pad(samples, (0, target_len - len(samples)))
        else:
            samples = samples[:target_len]

        # STFT
        stft = librosa.stft(
            samples,
            n_fft=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )
        stft_mag = np.abs(stft)

        # Mel-Spectrogram (128 bands)
        mel_spec = librosa.feature.melspectrogram(
            y=samples,
            sr=self.sample_rate,
            n_mels=self.N_MEL_BANDS,
            n_fft=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)

        # MFCCs (top 20 coefficients)
        mfccs = librosa.feature.mfcc(
            S=mel_spec_db,
            sr=self.sample_rate,
            n_mfcc=self.N_MFCC,
        )

        # Spectral centroid
        spectral_centroid = librosa.feature.spectral_centroid(
            y=samples,
            sr=self.sample_rate,
            n_fft=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )[0]

        # Zero-crossing rate
        zcr = librosa.feature.zero_crossing_rate(
            samples,
            frame_length=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )[0]

        # Pitch contour via pyin
        f0, voiced_flag, _ = librosa.pyin(
            samples,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=self.sample_rate,
            frame_length=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )
        pitch_contour = np.nan_to_num(f0, nan=0.0)
        voiced_pitches = pitch_contour[voiced_flag] if voiced_flag is not None else np.array([])

        # Pitch variability (std of voiced frames)
        pitch_variability = float(np.std(voiced_pitches)) if len(voiced_pitches) > 1 else 0.0

        # Rapid frequency spikes — peaks in the derivative of the pitch contour
        pitch_derivative = np.abs(np.diff(pitch_contour))
        spikes, _ = find_peaks(pitch_derivative, height=np.percentile(pitch_derivative, 90) if len(pitch_derivative) > 0 else 1.0)
        frequency_spike_count = int(len(spikes))

        # RMS energy
        rms = librosa.feature.rms(y=samples, frame_length=self.N_FFT, hop_length=self.HOP_LENGTH)[0]
        rms_energy = float(rms.mean())

        return AudioFeatures(
            stft_magnitude=stft_mag,
            mel_spectrogram=mel_spec_db,
            mfccs=mfccs,
            spectral_centroid=spectral_centroid,
            zero_crossing_rate=zcr,
            pitch_contour=pitch_contour,
            pitch_variability=pitch_variability,
            frequency_spike_count=frequency_spike_count,
            rms_energy=rms_energy,
        )

    # ---- Vision pipeline -------------------------------------------------

    def extract_vision_features(
        self,
        frames: list[np.ndarray],
        prev_centroids: Optional[list[tuple[float, float]]] = None,
    ) -> VisionFeatures:
        """Process a batch of 1080p video frames from an RTSP stream.

        Uses contour-based keypoint detection to compute:
          - Head-tilt angle (head bounding box rotation)
          - Ear orientation (ear-tip angle relative to skull axis)
          - Tail-tuck angle (tail angle relative to spine axis)
          - Pacing velocity (centroid displacement over time)

        Args:
            frames: List of BGR frames (numpy arrays) from OpenCV capture.
            prev_centroids: Centroids from the previous batch for velocity continuity.

        Returns:
            VisionFeatures with computed pose descriptors.
        """
        if not frames:
            return VisionFeatures(
                head_tilt_angle=0.0,
                ear_orientation=0.0,
                tail_tuck_angle=0.0,
            )

        head_tilt_angles: list[float] = []
        ear_orientations: list[float] = []
        tail_tuck_angles: list[float] = []
        centroids: list[tuple[float, float]] = []

        for frame in frames:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edges = cv2.Canny(blurred, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            # Filter contours by area — animal body should be the largest
            significant = [c for c in contours if cv2.contourArea(c) > 500]
            if not significant:
                continue

            body_contour = max(significant, key=cv2.contourArea)
            rect = cv2.minAreaRect(body_contour)
            _, (w, h), angle = rect

            # Head tilt: rotation angle of the bounding box (normalized to 0-90)
            head_tilt = abs(angle) if w > h else abs(angle + 90)
            head_tilt = min(head_tilt, 180 - head_tilt)
            head_tilt_angles.append(head_tilt)

            # Ear orientation: approximate from the upper-third contour asymmetry
            x, y, bw, bh = cv2.boundingRect(body_contour)
            upper_third = gray[y : y + bh // 3, x : x + bw]
            if upper_third.size > 0:
                _, ear_thresh = cv2.threshold(upper_third, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                ear_contours, _ = cv2.findContours(ear_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if len(ear_contours) >= 2:
                    ear_contours_sorted = sorted(ear_contours, key=cv2.contourArea, reverse=True)[:2]
                    cx_list = [cv2.moments(c)["m10"] / (cv2.moments(c)["m00"] + 1e-7) for c in ear_contours_sorted]
                    ear_orientations.append(abs(cx_list[0] - cx_list[1]))
                else:
                    ear_orientations.append(0.0)
            else:
                ear_orientations.append(0.0)

            # Tail tuck: angle of the lower-third extremity relative to spine axis
            lower_region = gray[y + 2 * bh // 3 : y + bh, x : x + bw]
            if lower_region.size > 0:
                lower_edges = cv2.Canny(lower_region, 50, 150)
                lower_contours, _ = cv2.findContours(lower_edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if lower_contours:
                    tail_contour = max(lower_contours, key=cv2.contourArea)
                    tail_rect = cv2.minAreaRect(tail_contour)
                    _, _, tail_angle = tail_rect
                    spine_angle = angle
                    tail_tuck = abs(tail_angle - spine_angle)
                    tail_tuck = min(tail_tuck, 180 - tail_tuck)
                    tail_tuck_angles.append(tail_tuck)
                else:
                    tail_tuck_angles.append(0.0)
            else:
                tail_tuck_angles.append(0.0)

            # Bounding box centroid
            cx = x + bw / 2
            cy = y + bh / 2
            centroids.append((cx, cy))

        # Pacing velocity: average centroid displacement per frame
        pacing_velocity = self._compute_pacing_velocity(centroids, prev_centroids)

        return VisionFeatures(
            head_tilt_angle=float(np.mean(head_tilt_angles)) if head_tilt_angles else 0.0,
            ear_orientation=float(np.mean(ear_orientations)) if ear_orientations else 0.0,
            tail_tuck_angle=float(np.mean(tail_tuck_angles)) if tail_tuck_angles else 0.0,
            bounding_box_centroids=centroids,
            pacing_velocity=pacing_velocity,
        )

    # ---- Helpers ---------------------------------------------------------

    @staticmethod
    def _bytes_to_pcm(audio_bytes: bytes) -> np.ndarray:
        """Convert raw 16-bit PCM bytes to a float32 numpy array in [-1, 1]."""
        return librosa.util.buf_to_float(
            np.frombuffer(audio_bytes, dtype=np.int16).tobytes(),
            n_bytes=2,
        )

    @staticmethod
    def _compute_pacing_velocity(
        centroids: list[tuple[float, float]],
        prev_centroids: Optional[list[tuple[float, float]]],
    ) -> float:
        """Average pixel displacement per frame, optionally chaining to prior batch."""
        all_centroids: list[tuple[float, float]] = []
        if prev_centroids and centroids:
            all_centroids.extend(prev_centroids[-1:])
        all_centroids.extend(centroids)

        if len(all_centroids) < 2:
            return 0.0

        displacements = [
            np.sqrt((all_centroids[i + 1][0] - all_centroids[i][0]) ** 2
                    + (all_centroids[i + 1][1] - all_centroids[i][1]) ** 2)
            for i in range(len(all_centroids) - 1)
        ]
        return float(np.mean(displacements))
