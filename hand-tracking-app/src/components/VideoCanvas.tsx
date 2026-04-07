import type { MutableRefObject } from 'react';

interface VideoCanvasProps {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
}

export default function VideoCanvas({ videoRef }: VideoCanvasProps) {
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 z-0 h-full w-full object-cover [transform:scaleX(-1)]"
    />
  );
}
