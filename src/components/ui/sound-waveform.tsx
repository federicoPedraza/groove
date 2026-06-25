"use client";

import { useEffect, useRef, useState } from "react";

import { loadSoundBuffer } from "@/src/lib/utils/sound";

export type SoundWaveformStatus = "idle" | "loading" | "ready" | "error";

type SoundWaveformProps = {
  fileName: string | null;
  isPlaying?: boolean;
  barCount?: number;
  className?: string;
  onStatusChange?: (status: SoundWaveformStatus) => void;
};

async function fetchWaveformData(
  fileName: string,
  barCount: number,
): Promise<number[]> {
  const loadPromise = loadSoundBuffer(fileName);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Audio decode timed out")), 5000),
  );
  const audioBuffer = await Promise.race([loadPromise, timeoutPromise]);

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
  isError,
  className,
}: {
  barCount: number;
  isPlaying: boolean;
  isError: boolean;
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
            isError
              ? "bg-destructive/25"
              : isPlaying
                ? "bg-green-600/40 dark:bg-green-400/40"
                : "bg-muted-foreground/20"
          }`}
          style={{
            height: isError
              ? "2px"
              : `${Math.max(2, Math.sin((i / barCount) * Math.PI) * 16)}px`,
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
  onStatusChange,
}: SoundWaveformProps) {
  const [bars, setBars] = useState<number[] | null>(null);
  const [error, setError] = useState(false);
  const fileNameRef = useRef(fileName);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    fileNameRef.current = fileName;
    setBars(null);
    setError(false);

    if (!fileName) {
      onStatusChangeRef.current?.("idle");
      return;
    }

    onStatusChangeRef.current?.("loading");

    void (async () => {
      try {
        const data = await fetchWaveformData(fileName, barCount);
        if (fileNameRef.current === fileName) {
          setBars(data);
          onStatusChangeRef.current?.("ready");
        }
      } catch {
        if (fileNameRef.current === fileName) {
          setError(true);
          onStatusChangeRef.current?.("error");
        }
      }
    })();
  }, [fileName, barCount]);

  if (!fileName || error || !bars) {
    return (
      <PlaceholderBars
        barCount={barCount}
        isPlaying={isPlaying}
        isError={error}
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
