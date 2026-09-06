/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface TickingNumberProps {
  value: number;
  format: (v: number) => string;
  className?: string;
}

/**
 * Tweens between successive values with GSAP. The DOM text is owned by the effect after
 * mount so React never paints the final number before the tween starts. Reduced motion
 * writes the value directly.
 */
export function TickingNumber({ value, format, className }: TickingNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const [initialText] = useState(() => format(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    shown.current = value;
    if (
      from === null ||
      reduced ||
      from === value ||
      !Number.isFinite(from) ||
      !Number.isFinite(value)
    ) {
      el.textContent = format(value);
      return;
    }
    const proxy = { v: from };
    const tween = gsap.to(proxy, {
      v: value,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = format(proxy.v);
      },
    });
    return () => {
      tween.kill();
      el.textContent = format(value);
    };
  }, [value, format, reduced]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {initialText}
    </span>
  );
}
