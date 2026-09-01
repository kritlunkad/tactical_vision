import { Delaunay } from 'd3-delaunay';
import { Point2D, DetectedEntity, PassingNetworkData, PassConnection, TacticalMetrics, SportType } from '../types';

// ==========================================
// 1. HOMOGRAPHY MATRIX & PERSPECTIVE WARP
// ==========================================

export type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

/**
 * Solves 3x3 Homography Matrix mapping 4 source points to 4 destination points
 * using Direct Linear Transformation (DLT) with Gaussian Elimination.
 */
export function computeHomography(src: Point2D[], dst: Point2D[]): Matrix3x3 {
  if (src.length < 4 || dst.length < 4) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
  }

  // Build 8x8 linear system A * h = b
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const X = dst[i].x;
    const Y = dst[i].y;

    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);

    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / pivot;
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      b[k] -= factor * b[i];
    }
  }

  // Back substitution
  const h = new Array(8).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * h[j];
    }
    const divisor = A[i][i];
    h[i] = Math.abs(divisor) > 1e-10 ? (b[i] - sum) / divisor : 0;
  }

  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1.0]
  ];
}

/**
 * Apply Homography Matrix to project a 2D point
 */
export function applyHomography(H: Matrix3x3, pt: Point2D): Point2D {
  const x = pt.x;
  const y = pt.y;

  const denom = H[2][0] * x + H[2][1] * y + H[2][2];
  if (Math.abs(denom) < 1e-8) return { x: pt.x, y: pt.y };

  const px = (H[0][0] * x + H[0][1] * y + H[0][2]) / denom;
  const py = (H[1][0] * x + H[1][1] * y + H[1][2]) / denom;

  return {
    x: Math.max(0, Math.min(100, px)),
    y: Math.max(0, Math.min(100, py))
  };
}

/**
 * Inverts a 3x3 matrix
 */
export function invertMatrix3x3(M: Matrix3x3): Matrix3x3 {
  const [[a, b, c], [d, e, f], [g, h, k]] = M;
  const A = e * k - f * h;
  const B = -(d * k - f * g);
  const C = d * h - e * g;
  const D = -(b * k - c * h);
  const E = a * k - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H_val = -(a * f - c * d);
  const K = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-10) {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  const invDet = 1 / det;
  return [
    [A * invDet, D * invDet, G * invDet],
    [B * invDet, E * invDet, H_val * invDet],
    [C * invDet, F * invDet, K * invDet]
  ];
}

// ==========================================
// 2. VORONOI PITCH CONTROL & SPATIAL DOMINANCE
// ==========================================

export interface VoronoiCell {
  playerId: string;
  playerName: string;
  team: 'teamA' | 'teamB';
  polygon: [number, number][];
  areaPercent: number;
}

export function computeVoronoiPitchControl(
  entities: DetectedEntity[],
  bounds: [number, number, number, number] = [0, 0, 100, 100]
): {
  cells: VoronoiCell[];
  pitchControlA: number;
  pitchControlB: number;
} {
  const players = entities.filter(e => e.team === 'teamA' || e.team === 'teamB');
  if (players.length < 3) {
    return { cells: [], pitchControlA: 50, pitchControlB: 50 };
  }

  // Ensure points have slight jitter if co-linear
  const points: [number, number][] = players.map((p, idx) => [
    p.pitchPos.x + (idx * 0.001),
    p.pitchPos.y + (idx * 0.001)
  ]);

  try {
    const delaunay = Delaunay.from(points);
    const voronoi = delaunay.voronoi(bounds);

    const cells: VoronoiCell[] = [];
    let areaA = 0;
    let areaB = 0;
    const totalFieldArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);

    for (let i = 0; i < players.length; i++) {
      const polygon = voronoi.cellPolygon(i);
      if (!polygon || polygon.length === 0) continue;

      // Calculate polygon area via Shoelace formula
      let cellArea = 0;
      for (let j = 0; j < polygon.length - 1; j++) {
        cellArea += polygon[j][0] * polygon[j + 1][1] - polygon[j + 1][0] * polygon[j][1];
      }
      cellArea = Math.abs(cellArea) / 2;
      const areaPercent = (cellArea / totalFieldArea) * 100;

      if (players[i].team === 'teamA') {
        areaA += cellArea;
      } else {
        areaB += cellArea;
      }

      cells.push({
        playerId: players[i].id,
        playerName: players[i].name,
        team: players[i].team as 'teamA' | 'teamB',
        polygon: polygon as [number, number][],
        areaPercent: Math.round(areaPercent * 10) / 10
      });
    }

    const totalCalculated = areaA + areaB || 1;
    const pitchControlA = Math.round((areaA / totalCalculated) * 100);
    const pitchControlB = 100 - pitchControlA;

    return { cells, pitchControlA, pitchControlB };
  } catch (err) {
    console.warn('Voronoi calculation error, falling back:', err);
    return { cells: [], pitchControlA: 50, pitchControlB: 50 };
  }
}

// ==========================================
// 3. CONVEX HULL & DEFENSIVE COMPACTNESS
// ==========================================

export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];

  // Sort by x then y
  const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  // Lower hull
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function computeTeamCompactness(
  entities: DetectedEntity[],
  team: 'teamA' | 'teamB',
  pitchLengthMeters = 105,
  pitchWidthMeters = 68
) {
  // Exclude goalkeepers from field compactness calculation
  const outfield = entities.filter(e => e.team === team && e.role !== 'goalkeeper');
  if (outfield.length < 3) {
    return { lineDepthMeters: 30, teamWidthMeters: 35, convexHullAreaSqM: 950, hullPoints: [] };
  }

  const points = outfield.map(e => e.pitchPos);
  const hullPoints = computeConvexHull(points);

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const lineDepthMeters = Math.round(((maxX - minX) / 100) * pitchLengthMeters * 10) / 10;
  const teamWidthMeters = Math.round(((maxY - minY) / 100) * pitchWidthMeters * 10) / 10;

  // Hull area in sq meters
  let areaNorm = 0;
  for (let i = 0; i < hullPoints.length; i++) {
    const next = hullPoints[(i + 1) % hullPoints.length];
    areaNorm += hullPoints[i].x * next.y - next.x * hullPoints[i].y;
  }
  areaNorm = Math.abs(areaNorm) / 20000; // normalized [0..1]
  const convexHullAreaSqM = Math.round(areaNorm * pitchLengthMeters * pitchWidthMeters);

  return {
    lineDepthMeters,
    teamWidthMeters,
    convexHullAreaSqM,
    hullPoints
  };
}

// ==========================================
// 4. KERNEL DENSITY ESTIMATION (KDE) HEATMAP
// ==========================================

export function computeSpatialHeatmapGrid(
  points: Point2D[],
  gridCols = 60,
  gridRows = 40,
  bandwidth = 6.5
): { grid: number[][]; maxDensity: number } {
  const grid: number[][] = Array.from({ length: gridRows }, () => new Array(gridCols).fill(0));
  if (points.length === 0) {
    return { grid, maxDensity: 1 };
  }

  const twoSigmaSq = 2 * bandwidth * bandwidth;
  let maxDensity = 0;

  for (let r = 0; r < gridRows; r++) {
    const py = (r / (gridRows - 1)) * 100;
    for (let c = 0; c < gridCols; c++) {
      const px = (c / (gridCols - 1)) * 100;

      let sum = 0;
      for (const pt of points) {
        const dx = px - pt.x;
        const dy = py - pt.y;
        const distSq = dx * dx + dy * dy;
        sum += Math.exp(-distSq / twoSigmaSq);
      }

      grid[r][c] = sum;
      if (sum > maxDensity) {
        maxDensity = sum;
      }
    }
  }

  // Normalize grid
  if (maxDensity > 0) {
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        grid[r][c] /= maxDensity;
      }
    }
  }

  return { grid, maxDensity };
}

// ==========================================
// 5. AUTOMATED FORMATION RECOGNITION
// ==========================================

export function detectFormation(
  entities: DetectedEntity[],
  team: 'teamA' | 'teamB',
  sport: SportType = 'football'
): string {
  const teamEntities = entities.filter(e => e.team === team);
  if (teamEntities.length === 0) return sport === 'kabaddi' ? '2-3-2' : '4-3-3';

  if (sport === 'kabaddi') {
    // Kabaddi 7-player setup: Corners, Covers, In-Out Chains
    const count = teamEntities.length;
    if (count <= 4) return '2-2 Compact Wall';
    if (count === 5) return '2-1-2 Chain Arc';
    if (count === 6) return '2-2-2 Parallel Line';
    return '2-3-2 Baulk Defensive Arc';
  }

  if (sport === 'hockey') {
    // Hockey 11v11 or 6v6/5v5
    const outfield = teamEntities.filter(e => e.role !== 'goalkeeper');
    if (outfield.length <= 5) return '1-3-1 Power Play';
    return '3-3-2-2 Active Press';
  }

  // Football (Soccer)
  const outfield = teamEntities.filter(e => e.role !== 'goalkeeper');
  if (outfield.length < 7) return '4-3-3';

  // Sort by X coordinate (defense -> midfield -> attack)
  const isTeamA = team === 'teamA';
  const sorted = [...outfield].sort((a, b) => isTeamA ? a.pitchPos.x - b.pitchPos.x : b.pitchPos.x - a.pitchPos.x);

  // Group into 3 or 4 spatial vertical bands
  const minX = Math.min(...sorted.map(p => p.pitchPos.x));
  const maxX = Math.max(...sorted.map(p => p.pitchPos.x));
  const range = Math.max(1, maxX - minX);

  let defenders = 0;
  let midfielders = 0;
  let forwards = 0;

  sorted.forEach(p => {
    const relX = isTeamA ? (p.pitchPos.x - minX) / range : (maxX - p.pitchPos.x) / range;
    if (relX < 0.35) {
      defenders++;
    } else if (relX < 0.72) {
      midfielders++;
    } else {
      forwards++;
    }
  });

  // Standardize common soccer formations
  if (defenders === 4 && midfielders === 3 && forwards === 3) return '4-3-3 Holding';
  if (defenders === 4 && midfielders === 2 && forwards === 4) return '4-2-3-1 Fluid';
  if (defenders === 4 && midfielders === 4 && forwards === 2) return '4-4-2 Mid-Block';
  if (defenders === 3 && midfielders === 5 && forwards === 2) return '3-5-2 Wingback';
  if (defenders === 5 && midfielders === 3 && forwards === 2) return '5-3-2 Low Block';
  if (defenders === 3 && midfielders === 4 && forwards === 3) return '3-4-3 Overload';

  // Fallback string construction
  return `${Math.max(3, Math.min(5, defenders))}-${Math.max(2, Math.min(5, midfielders))}-${Math.max(1, Math.min(4, forwards))}`;
}

// ==========================================
// 6. EXPECTED THREAT (xT) MATRIX
// ==========================================

// Pre-computed 16x12 Expected Threat (xT) grid for soccer pitch
export const XT_PITCH_GRID: number[][] = [
  [0.001, 0.002, 0.003, 0.005, 0.008, 0.012, 0.018, 0.027, 0.039, 0.056, 0.078, 0.115, 0.162, 0.220, 0.310, 0.450],
  [0.001, 0.002, 0.004, 0.006, 0.010, 0.015, 0.022, 0.033, 0.048, 0.068, 0.098, 0.142, 0.201, 0.285, 0.395, 0.580],
  [0.001, 0.003, 0.005, 0.008, 0.012, 0.018, 0.028, 0.042, 0.062, 0.089, 0.128, 0.185, 0.265, 0.370, 0.510, 0.760],
  [0.002, 0.003, 0.006, 0.009, 0.015, 0.023, 0.035, 0.052, 0.078, 0.112, 0.162, 0.235, 0.340, 0.485, 0.680, 0.940],
  [0.002, 0.003, 0.006, 0.009, 0.015, 0.023, 0.035, 0.052, 0.078, 0.112, 0.162, 0.235, 0.340, 0.485, 0.680, 0.940],
  [0.001, 0.003, 0.005, 0.008, 0.012, 0.018, 0.028, 0.042, 0.062, 0.089, 0.128, 0.185, 0.265, 0.370, 0.510, 0.760],
  [0.001, 0.002, 0.004, 0.006, 0.010, 0.015, 0.022, 0.033, 0.048, 0.068, 0.098, 0.142, 0.201, 0.285, 0.395, 0.580],
  [0.001, 0.002, 0.003, 0.005, 0.008, 0.012, 0.018, 0.027, 0.039, 0.056, 0.078, 0.115, 0.162, 0.220, 0.310, 0.450]
];

export function getExpectedThreat(pos: Point2D, team: 'teamA' | 'teamB'): number {
  const rows = XT_PITCH_GRID.length;
  const cols = XT_PITCH_GRID[0].length;

  let colIdx = Math.floor((pos.x / 100) * cols);
  let rowIdx = Math.floor((pos.y / 100) * rows);

  colIdx = Math.max(0, Math.min(cols - 1, colIdx));
  rowIdx = Math.max(0, Math.min(rows - 1, rowIdx));

  // If Team B is attacking in reverse direction (right to left)
  if (team === 'teamB') {
    colIdx = cols - 1 - colIdx;
  }

  return XT_PITCH_GRID[rowIdx][colIdx];
}
