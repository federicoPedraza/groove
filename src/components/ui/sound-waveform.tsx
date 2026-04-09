"use client";

import { useEffect, useRef, useState } from "react";

import { soundLibraryRead } from "@/src/lib/ipc/commands-features";

type SoundWaveformProps = {
  fileName: string | null;
  isPlaying?: boolean;
  barCount?: number;
  className?: string;
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function fetchWaveformData(
  fileName: string,
  barCount: number,
): Promise<number[]> {
  const result = await soundLibraryRead(fileName);
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? "Failed to read sound file");
  }

  const arrayBuffer = base64ToArrayBuffer(result.data);
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  const channelData = audioBuffer.getChannelData(0);
  const samplesPerBar = Math.floor(channelData.length / barCount);
  const bars: number[] = [];

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, channelData.length);
    for (let j = start; j < end; j++) {
      sum += Math.abs(channelData[j]!);
    }
    bars.push(sum / (end - start));
  }

  const maxAmplitude = Math.max(...bars, 0.001);
  return bars.map((v) => v / maxAmplitude);
}

function PlaceholderBars({
  barCount,
  isPlaying,
  className,
}: {
  barCount: number;
  isPlaying: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-px ${className ?? ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          className={`w-[2px] rounded-full transition-colors ${
            isPlaying
              ? "bg-green-600/40 dark:bg-green-400/40"
              : "bg-muted-foreground/20"
          }`}
          style={{
            height: `${Math.max(2, Math.sin((i / barCount) * Math.PI) * 16)}px`,
          }}
        />
      ))}
    </div>
  );
}

export function SoundWaveform({
  fileName,
  isPlaying = false,
  barCount = 40,
  className,
}: SoundWaveformProps) {
  const [bars, setBars] = useState<number[] | null>(null);
  const [error, setError] = useState(false);
  const fileNameRef = useRef(fileName);

  useEffect(() => {
    fileNameRef.current = fileName;
    setBars(null);
    setError(false);

    if (!fileName) {
      return;
    }

    void (async () => {
      try {
        const data = await fetchWaveformData(fileName, barCount);
        if (fileNameRef.current === fileName) {
          setBars(data);
        }
      } catch {
        if (fileNameRef.current === fileName) {
          setError(true);
        }
      }
    })();
  }, [fileName, barCount]);

  if (!fileName || error || !bars) {
    return (
      <PlaceholderBars
        barCount={barCount}
        isPlaying={isPlaying}
        className={className}
      />
    );
  }

  return (
    <div
      className={`flex items-center gap-px ${className ?? ""}`}
      aria-hidden="true"
    >
      {bars.map((amplitude, i) => (
        <div
          key={i}
          className={`w-[2px] rounded-full transition-colors ${
            isPlaying
              ? "bg-green-600 dark:bg-green-400"
              : "bg-muted-foreground/40"
          }`}
          style={{ height: `${Math.max(2, amplitude * 20)}px` }}
        />
      ))}
    </div>
  );
}
