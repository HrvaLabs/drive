import type { DriveAnalysis, SeriesPoint } from '../types';

// Interior edges; bands are <edges[0], [edges[i], edges[i+1]), edges[last]+.
export const SPEED_EDGES = [10, 30, 50, 70, 90, 110, 130]; // km/h
export const RPM_EDGES = [1000, 1500, 2000, 2500, 3000, 3500, 4000];

// Signal-name preference lists (mirror the server's speed_source fallback).
export const SPEED_SIGNALS = ['Vehicle speed', 'Speed (GPS)'];
export const RPM_SIGNALS = ['Engine RPM'];

export interface Band {
  band: string;
  pct: number;
}

export function bandLabels(edges: number[]): string[] {
  const labels = [`<${edges[0]}`];
  for (let i = 0; i < edges.length - 1; i++) labels.push(`${edges[i]}–${edges[i + 1]}`);
  labels.push(`${edges[edges.length - 1]}+`);
  return labels;
}

export function distribute(points: SeriesPoint[] | undefined, edges: number[]): Band[] {
  if (!points || points.length === 0) return [];
  const counts = new Array(edges.length + 1).fill(0);
  for (const p of points) {
    let i = 0;
    while (i < edges.length && p.v >= edges[i]) i++; // value on an edge -> upper band
    counts[i] += 1;
  }
  const total = points.length;
  return bandLabels(edges).map((band, i) => ({
    band,
    pct: Math.round((counts[i] / total) * 1000) / 10,
  }));
}

// First present, non-empty signal's points (by name preference), else undefined.
export function signalPoints(analysis: DriveAnalysis, names: string[]): SeriesPoint[] | undefined {
  for (const n of names) {
    const pts = analysis.signals[n]?.points;
    if (pts && pts.length) return pts;
  }
  return undefined;
}
