/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BackSide, Color, ShaderMaterial, Vector3 } from 'three';
import type { CanvasTexture } from 'three';
import { buildBasemap } from './basemap';
import { ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX, EARTH_FRAGMENT, EARTH_VERTEX } from './shaders';

const RIM = new Color('#8a94a8');
const HALO = new Color('#6f7f9c');

export function Earth() {
  const invalidate = useThree((s) => s.invalidate);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);

  useEffect(() => {
    let disposed = false;
    let created: CanvasTexture | null = null;
    // Half-resolution basemap on phones: the draw is main-thread work under a 4x CPU throttle.
    const width = window.innerWidth < 768 ? 1024 : 2048;
    buildBasemap(width, width / 2)
      .then((tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        created = tex;
        setTexture(tex);
        invalidate();
      })
      .catch(() => {
        // The sphere still renders with the flat ocean colour; markers stay usable.
      });
    return () => {
      disposed = true;
      created?.dispose();
    };
  }, [invalidate]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: EARTH_FRAGMENT,
        uniforms: {
          uMap: { value: null },
          uLightDir: { value: new Vector3(-0.5, 0.4, 0.8) },
          uRim: { value: RIM },
        },
      }),
    [],
  );

  useEffect(() => {
    material.uniforms.uMap!.value = texture;
    material.needsUpdate = true;
  }, [material, texture]);

  useEffect(() => () => material.dispose(), [material]);

  // Headlight that sits up and to the left of the camera, so the terminator is always in
  // view no matter how the user has orbited.
  const scratch = useMemo(() => ({ dir: new Vector3(), side: new Vector3(), up: new Vector3() }), []);
  useFrame(({ camera }) => {
    const { dir, side, up } = scratch;
    dir.copy(camera.position).normalize();
    up.copy(camera.up);
    side.crossVectors(up, dir).normalize();
    dir.addScaledVector(side, -0.9).addScaledVector(up, 0.6).normalize();
    (material.uniforms.uLightDir!.value as Vector3).copy(dir);
  });

  const atmosphere = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        uniforms: { uColor: { value: HALO }, uIntensity: { value: 0.9 } },
        blending: AdditiveBlending,
        side: BackSide,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => atmosphere.dispose(), [atmosphere]);

  return (
    <group>
      <mesh material={material}>
        <sphereGeometry args={[1, 72, 48]} />
      </mesh>
      <mesh material={atmosphere} scale={1.045}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
    </group>
  );
}
