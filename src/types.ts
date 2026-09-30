export type SportType = 'football' | 'hockey';

export interface Point2D {
  x: number; // 0 to 100 or metric coordinates
  y: number; // 0 to 100 or metric coordinates
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EntityRole = 'goalkeeper' | 'defender' | 'midfielder' | 'forward' | 'referee' | 'ball' | 'puck';

export interface DetectedEntity {
  id: string;
  name: string;
  jerseyNumber?: number;
  team: 'teamA' | 'teamB' | 'neutral';
  role: EntityRole;
  confidence: number; // 0.0 - 1.0
  bbox: BoundingBox; // Broadcast frame screen coordinates [0..100%]
  screenPos: Point2D; // Base anchor on screen
  pitchPos: Point2D; // Projected Top-Down 2D coordinate [0..100]
  velocity: Point2D; // Speed vector (dx, dy)
  speedKmh: number;
  distanceCoveredMeters: number;
  hasPossession?: boolean;
}

export interface FrameData {
  frameIndex: number;
  timestampSec: number;
  timeDisplay: string;
  entities: DetectedEntity[];
  ballPos: Point2D | null;
  ballScreenPos?: Point2D | null;
  possessionTeam: 'teamA' | 'teamB' | 'neutral';
  possessionPlayerId: string | null;
  phase: 'build_up' | 'high_press' | 'counter_attack' | 'settled_defense' | 'transitional' | 'offensive_zone' | 'defensive_zone' | 'neutral_zone' | 'forecheck' | 'power_play' | 'penalty_kill';
  eventTag?: string;
  homographyCalibration: Point2D[]; // 4 anchor corners on broadcast view
}

export interface TeamConfig {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  formation: string;
  sport: SportType;
}

export interface PassConnection {
  fromId: string;
  toId: string;
  count: number;
  successRate: number; // 0 - 100
  avgDistanceMeters: number;
  xThreatGained: number;
}

export interface PassingNetworkData {
  nodes: {
    id: string;
    name: string;
    jerseyNumber: number;
    avgPitchPos: Point2D;
    touches: number;
    centrality: number; // 0 - 1.0 (Betweenness/Degree)
    role: EntityRole;
    team: 'teamA' | 'teamB';
  }[];
  edges: PassConnection[];
  dominantChannnel: 'Left Wing' | 'Left Half-Space' | 'Center' | 'Right Half-Space' | 'Right Wing';
  passAccuracy: number;
  directnessIndex: number; // 0 to 100
}

export interface TacticalMetrics {
  possessionA: number; // %
  possessionB: number; // %
  pitchControlA: number; // %
  pitchControlB: number; // %
  ppdaTeamA: number; // Passes per Defensive Action
  ppdaTeamB: number;
  compactnessA: {
    lineDepthMeters: number;
    teamWidthMeters: number;
    convexHullAreaSqM: number;
  };
  compactnessB: {
    lineDepthMeters: number;
    teamWidthMeters: number;
    convexHullAreaSqM: number;
  };
  expectedThreatTeamA: number;
  expectedThreatTeamB: number;
  defensiveTransitionsCount: number;
  keyRecoveryZonesCount: number;
  detectedFormationA: string;
  detectedFormationB: string;
}

export interface AIReportData {
  tacticalSummary: string;
  structuralStrengths: string[];
  tacticalVulnerabilities: string[];
  coachingDirectives: string[];
  counterStrategy: string;
  recommendedDrill: {
    title: string;
    duration: string;
    intensity: string;
    objective: string;
    instructions: string;
  };
}

export interface DrawingAnnotation {
  id: string;
  type: 'arrow' | 'line' | 'circle' | 'spotlight' | 'zone' | 'freehand' | 'text';
  color: string;
  points: Point2D[];
  text?: string;
  timestamp: number;
}

export interface SportDimension {
  name: string;
  lengthMeters: number;
  widthMeters: number;
  pitchRatio: number; // length / width
  surfaceTheme: 'grass' | 'ice';
  landmarks: {
    name: string;
    pitchPos: Point2D;
  }[];
}

export interface SampleMatch {
  id: string;
  name: string;
  sport: SportType;
  description: string;
  teamA: TeamConfig;
  teamB: TeamConfig;
  durationSec: number;
  fps: number;
  frames: FrameData[];
  passingNetworkA: PassingNetworkData;
  passingNetworkB: PassingNetworkData;
  baseMetrics: TacticalMetrics;
  dimension: SportDimension;
  videoPlaceholderTheme: string;
}

export type MatchData = SampleMatch;
