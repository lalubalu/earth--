/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { Candidate, DetectorName, RankingConfig, Signal } from './types.js';

function stronger(a: Candidate, b: Candidate): Candidate {
  if (a.severity !== b.severity) return a.severity > b.severity ? a : b;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  return a.id <= b.id ? a : b;
}

function toSignal(c: Candidate, startedAt: number, also: DetectorName[]): Signal {
  // ratio and group are working data for this module only.
  const { ratio: _ratio, group: _group, ...rest } = c;
  void _ratio;
  void _group;
  const signal: Signal = { ...rest, startedAt, status: 'active' };
  if (also.length > 0) signal.alsoDetectedBy = also;
  return signal;
}

/**
 * Turns raw candidates into the ranked signal list:
 * 1. hysteresis: a candidate below threshold survives only if it was active last run and
 *    still sits above hysteresis * threshold;
 * 2. threshold rules sharing a group collapse to the strongest;
 * 3. one signal per series, domain rules outranking statistical detectors, losers listed
 *    in alsoDetectedBy;
 * 4. startedAt carries over from the previous run;
 * 5. signals that just cleared stay for cooldownMs as `cooling`;
 * 6. sort by severity, then recency, then id, capped at maxSignals.
 */
export function reconcile(
  candidates: readonly Candidate[],
  previous: readonly Signal[],
  now: number,
  cfg: RankingConfig,
): Signal[] {
  const prevById = new Map(previous.map((s) => [s.id, s]));

  const live = [...candidates]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((c) => {
      if (c.ratio >= 1) return true;
      const prev = prevById.get(c.id);
      return prev?.status === 'active' && c.ratio >= cfg.hysteresis;
    });

  const groupWinners = new Map<string, Candidate>();
  for (const c of live) {
    if (!c.group) continue;
    const current = groupWinners.get(c.group);
    groupWinners.set(c.group, current ? stronger(current, c) : c);
  }
  const absorbed = new Set<string>();
  const afterGroups = live.filter((c) => {
    if (!c.group || groupWinners.get(c.group) === c) return true;
    absorbed.add(c.id);
    return false;
  });

  const bySeries = new Map<string, Candidate[]>();
  const winners: { candidate: Candidate; also: DetectorName[] }[] = [];
  for (const c of afterGroups) {
    if (!c.seriesId) {
      winners.push({ candidate: c, also: [] });
      continue;
    }
    const list = bySeries.get(c.seriesId);
    if (list) list.push(c);
    else bySeries.set(c.seriesId, [c]);
  }
  for (const list of bySeries.values()) {
    let winner = list[0] as Candidate;
    for (const c of list.slice(1)) {
      const ruleA = winner.detector === 'threshold';
      const ruleB = c.detector === 'threshold';
      if (ruleA !== ruleB) winner = ruleA ? winner : c;
      else winner = stronger(winner, c);
    }
    const also: DetectorName[] = [];
    for (const c of list) {
      if (c === winner) continue;
      absorbed.add(c.id);
      if (!also.includes(c.detector)) also.push(c.detector);
    }
    winners.push({ candidate: winner, also });
  }

  const signals: Signal[] = winners.map(({ candidate, also }) => {
    const prev = prevById.get(candidate.id);
    const startedAt = prev ? Math.min(prev.startedAt, candidate.startedAt) : candidate.startedAt;
    return toSignal(candidate, startedAt, also);
  });

  const liveIds = new Set(signals.map((s) => s.id));
  const coveredSeries = new Set(signals.map((s) => s.seriesId).filter(Boolean));
  for (const prev of previous) {
    if (liveIds.has(prev.id) || absorbed.has(prev.id)) continue;
    if (prev.seriesId && coveredSeries.has(prev.seriesId)) continue;
    const age = now - prev.updatedAt;
    if (age < 0 || age >= cfg.cooldownMs) continue;
    signals.push({ ...prev, status: 'cooling' });
  }

  signals.sort(
    (a, b) =>
      b.severity - a.severity ||
      b.updatedAt - a.updatedAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return signals.slice(0, cfg.maxSignals);
}
