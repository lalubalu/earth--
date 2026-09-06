/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { latLonToVector3 } from './latlon';
import type { Marker } from './markers';
import { MARKER_FRAGMENT, MARKER_VERTEX } from './shaders';

const ACCENT = new Color('#f5a524');
const NEUTRAL = new Color('#e9e6df');
const CAPACITY = 4096;

interface EventMarkersProps {
  markers: Marker[];
  animate: boolean;
  onPick: (id: string | null) => void;
}

/**
 * One instanced quad per marker, oriented tangent to the sphere. Kind is encoded as shape
 * and magnitude as size in the shader; per-instance attributes are rewritten in bulk when
 * the marker list changes, never per frame.
 */
export function EventMarkers({ markers, animate, onPick }: EventMarkersProps) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    for (const name of ['aMagnitude', 'aPhase', 'aShape', 'aTone', 'aSelected', 'aAge']) {
      g.setAttribute(name, new InstancedBufferAttribute(new Float32Array(CAPACITY), 1));
    }
    return g;
  }, []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: MARKER_VERTEX,
        fragmentShader: MARKER_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 0.042 },
          uPulse: { value: 1 },
          uAccent: { value: ACCENT },
          uNeutral: { value: NEUTRAL },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    const pos = new Vector3();
    const outward = new Vector3();
    const attr = (name: string) => geometry.getAttribute(name) as InstancedBufferAttribute;
    const magnitude = attr('aMagnitude');
    const phase = attr('aPhase');
    const shape = attr('aShape');
    const tone = attr('aTone');
    const selected = attr('aSelected');
    const age = attr('aAge');

    const count = Math.min(markers.length, CAPACITY);
    for (let i = 0; i < count; i++) {
      const mk = markers[i]!;
      latLonToVector3(mk.lat, mk.lon, mk.radius, pos);
      dummy.position.copy(pos);
      outward.copy(pos).multiplyScalar(2);
      dummy.lookAt(outward);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      magnitude.setX(i, mk.magnitude);
      // Deterministic phase from the id so a marker does not restart its ripple on refetch.
      phase.setX(i, hash01(mk.id));
      shape.setX(i, mk.shape);
      tone.setX(i, mk.tone);
      selected.setX(i, mk.selected ? 1 : 0);
      age.setX(i, mk.age);
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    for (const a of [magnitude, phase, shape, tone, selected, age]) a.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [markers, geometry, invalidate]);

  useEffect(() => {
    material.uniforms.uPulse!.value = animate ? 1 : 0;
    invalidate();
  }, [animate, material, invalidate]);

  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = clock.getElapsedTime();
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const id = event.instanceId;
    onPick(id !== undefined && markers[id] ? markers[id]!.id : null);
  };

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, CAPACITY]}
      frustumCulled={false}
      onClick={handleClick}
    />
  );
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}
