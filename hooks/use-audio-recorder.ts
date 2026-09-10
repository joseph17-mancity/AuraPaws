'use client';

import * as React from 'react';

type MicState = 'off' | 'starting' | 'on' | 'denied';

interface AudioRecorderResult {
  micState: MicState;
  audioUrl: string | null;
  recording: boolean;
  enableMic: () => void;
  disableMic: () => void;
  startRecording: () => void;
  stopRecording: () => void;
}

export function useAudioRecorder(): AudioRecorderResult {
  const [micState, setMicState] = React.useState<MicState>('off');
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [recording, setRecording] = React.useState(false);

  const streamRef = React.useRef<MediaStream | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const enableMic = React.useCallback(async () => {
    setMicState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      setMicState('on');
    } catch {
      setMicState('denied');
    }
  }, []);

  const disableMic = React.useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setMicState('off');
    setRecording(false);
  }, []);

  const startRecording = React.useCallback(() => {
    if (!streamRef.current || micState !== 'on') return;

    chunksRef.current = [];
    setAudioUrl(null);

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg',
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setRecording(false);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }, [micState]);

  const stopRecording = React.useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    micState,
    audioUrl,
    recording,
    enableMic,
    disableMic,
    startRecording,
    stopRecording,
  };
}
