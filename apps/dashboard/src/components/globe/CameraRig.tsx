/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { gsap } from 'gsap';
import { Quaternion, Vector3 } from 'three';
import { useUi } from '@/store/ui';
import { latLonToVector3 } from './latlon';

const FLY_DISTANCE = 2.5;
const FLY_SECONDS = 1.5;
const IDENTITY = new Quaternion();

/** The two members of drei's OrbitControls this file touches; avoids a three-stdlib import. */
interface OrbitLike {
  update: () => void;
  autoRotate: boolean;
}

interface CameraRigProps {
  reducedMotion: boolean;
}

/**
 * Flies the camera along the great circle to a signal's location with a GSAP tween on a
 * scalar, rotating the current direction toward the target with a quaternion slerp so
 * antipodal targets cannot collapse the path. Reduced motion jumps instead.
 */
export function CameraRig({ reducedMotion }: CameraRigProps) {
  const target = useUi((s) => s.flyTarget);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const invalidate = useThree((s) => s.invalidate);
  const tween = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!target) return;
    tween.current?.kill();
    if (controls) controls.autoRotate = false;

    const from = camera.position.clone();
    const fromDist = from.length();
    const fromDir = from.clone().normalize();
    const toDir = latLonToVector3(target.lat, target.lon, 1).normalize();
    const rotation = new Quaternion().setFromUnitVectors(fromDir, toDir);
    const step = new Quaternion();
    const dir = new Vector3();
    const proxy = { t: 0 };

    const apply = () => {
      step.slerpQuaternions(IDENTITY, rotation, proxy.t);
      dir.copy(fromDir).applyQuaternion(step).normalize();
      const dist = fromDist + (FLY_DISTANCE - fromDist) * proxy.t;
      camera.position.copy(dir.multiplyScalar(dist));
      camera.lookAt(0, 0, 0);
      controls?.update();
      invalidate();
    };

    if (reducedMotion) {
      proxy.t = 1;
      apply();
      return;
    }
    tween.current = gsap.to(proxy, {
      t: 1,
      duration: FLY_SECONDS,
      ease: 'power3.inOut',
      onUpdate: apply,
    });
    return () => {
      tween.current?.kill();
    };
  }, [target, camera, controls, invalidate, reducedMotion]);

  return null;
}

interface TickerProps {
  running: boolean;
  fps?: number;
}

/**
 * The canvas renders on demand. While markers should pulse, this asks for a frame at a
 * capped rate; when the panel is off-screen, the tab hidden, or motion reduced, nothing
 * renders until an interaction invalidates.
 */
export function Ticker({ running, fps = 24 }: TickerProps) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const interval = 1000 / fps;
    const loop = (t: number) => {
      if (t - last >= interval) {
        last = t;
        invalidate();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, fps, invalidate]);
  return null;
}
