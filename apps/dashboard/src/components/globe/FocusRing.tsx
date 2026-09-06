/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { DoubleSide, Object3D, Vector3 } from 'three';
import { useUi } from '@/store/ui';
import { latLonToVector3 } from './latlon';

/** A thin ring on the surface at the last fly-to target, so the eye finds the place. */
export function FocusRing() {
  const target = useUi((s) => s.flyTarget);
  const invalidate = useThree((s) => s.invalidate);
  const placement = useMemo(() => {
    if (!target) return null;
    const pos = latLonToVector3(target.lat, target.lon, 1.006);
    const o = new Object3D();
    o.position.copy(pos);
    o.lookAt(new Vector3().copy(pos).multiplyScalar(2));
    return { position: pos, quaternion: o.quaternion.clone() };
  }, [target]);

  useEffect(() => {
    invalidate();
  }, [placement, invalidate]);

  if (!placement) return null;
  return (
    <mesh position={placement.position} quaternion={placement.quaternion}>
      <ringGeometry args={[0.055, 0.062, 48]} />
      <meshBasicMaterial
        color="#ffd27a"
        transparent
        opacity={0.85}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
