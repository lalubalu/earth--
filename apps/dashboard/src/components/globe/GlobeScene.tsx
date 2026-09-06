/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Marker } from './markers';
import { CameraRig, Ticker } from './CameraRig';
import { Earth } from './Earth';
import { EventMarkers } from './EventMarkers';
import { FocusRing } from './FocusRing';

interface GlobeSceneProps {
  markers: Marker[];
  /** Panel is on screen and the tab is visible. */
  active: boolean;
  reducedMotion: boolean;
  onPick: (id: string | null) => void;
}

/**
 * On-demand frame loop: nothing renders unless something invalidates. The Ticker asks
 * for frames at 24 fps only while the panel is visible and motion is allowed, so an idle
 * background tab costs nothing.
 */
export function GlobeScene({ markers, active, reducedMotion, onPick }: GlobeSceneProps) {
  const animate = active && !reducedMotion;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [0.3, 0.7, 3.7], fov: 36, near: 0.1, far: 20 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      onPointerMissed={() => onPick(null)}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Earth />
      <EventMarkers markers={markers} animate={animate} onPick={onPick} />
      <FocusRing />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.6}
        minDistance={1.6}
        maxDistance={6}
        autoRotate={animate}
        autoRotateSpeed={0.35}
      />
      <CameraRig reducedMotion={reducedMotion} />
      <Ticker running={animate} />
    </Canvas>
  );
}
