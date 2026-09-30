import { SportType, TeamConfig, FrameData, PassingNetworkData, TacticalMetrics, SportDimension } from '../types';

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

// ----------------------------------------------------
// 1. FOOTBALL (SOCCER) SAMPLE MATCH
// ----------------------------------------------------

const footballDimension: SportDimension = {
  name: 'Standard 11v11 Association Football Pitch',
  lengthMeters: 105,
  widthMeters: 68,
  pitchRatio: 105 / 68,
  surfaceTheme: 'grass',
  landmarks: [
    { name: 'Top-Left Corner', pitchPos: { x: 0, y: 0 } },
    { name: 'Top-Right Corner', pitchPos: { x: 100, y: 0 } },
    { name: 'Bottom-Right Corner', pitchPos: { x: 100, y: 100 } },
    { name: 'Bottom-Left Corner', pitchPos: { x: 0, y: 100 } },
    { name: 'Center Circle', pitchPos: { x: 50, y: 50 } },
    { name: 'Left Penalty Box', pitchPos: { x: 16.5, y: 50 } },
    { name: 'Right Penalty Box', pitchPos: { x: 83.5, y: 50 } },
  ]
};

// Generate 40 sequential frames for football
function generateFootballFrames(): FrameData[] {
  const frames: FrameData[] = [];
  const totalFrames = 45;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const timeSec = Math.round(i * 0.4 * 10) / 10;
    const minStr = Math.floor(timeSec / 60).toString().padStart(2, '0');
    const secStr = Math.floor(timeSec % 60).toString().padStart(2, '0');

    // Camera perspective homography points on broadcast feed
    const homographyCalibration = [
      { x: 12 + Math.sin(t * 2) * 1.5, y: 22 },
      { x: 88 + Math.cos(t * 2) * 1.5, y: 22 },
      { x: 96 + Math.cos(t * 2) * 1.0, y: 88 },
      { x: 4 + Math.sin(t * 2) * 1.0, y: 88 }
    ];

    // Ball movement along build-up arc
    const ballX = 35 + t * 40 + Math.sin(t * 6) * 4;
    const ballY = 48 + Math.sin(t * 4) * 22;

    const entities = [
      // TEAM A (Sky Blue - 4-3-3 / 3-2-4-1 build-up)
      {
        id: 'A1', name: 'Ederson', jerseyNumber: 31, team: 'teamA' as const, role: 'goalkeeper' as const,
        confidence: 0.98,
        bbox: { x: 14, y: 54, w: 2.2, h: 4.8 },
        screenPos: { x: 15, y: 56 },
        pitchPos: { x: 6, y: 50 },
        velocity: { x: 0.1, y: 0.0 }, speedKmh: 4.2, distanceCoveredMeters: 120 + i * 2
      },
      {
        id: 'A2', name: 'Walker', jerseyNumber: 2, team: 'teamA' as const, role: 'defender' as const,
        confidence: 0.94,
        bbox: { x: 26 + t * 8, y: 32 + Math.sin(t * 3) * 3, w: 2.3, h: 5.0 },
        screenPos: { x: 27 + t * 8, y: 34 },
        pitchPos: { x: 28 + t * 14, y: 22 + Math.sin(t * 2) * 4 },
        velocity: { x: 1.2, y: 0.3 }, speedKmh: 16.4, distanceCoveredMeters: 450 + i * 8
      },
      {
        id: 'A3', name: 'Dias', jerseyNumber: 3, team: 'teamA' as const, role: 'defender' as const,
        confidence: 0.96,
        bbox: { x: 22 + t * 6, y: 50, w: 2.3, h: 5.0 },
        screenPos: { x: 23 + t * 6, y: 52 },
        pitchPos: { x: 24 + t * 10, y: 44 },
        velocity: { x: 0.8, y: 0.1 }, speedKmh: 9.8, distanceCoveredMeters: 380 + i * 5
      },
      {
        id: 'A4', name: 'Akanji', jerseyNumber: 25, team: 'teamA' as const, role: 'defender' as const,
        confidence: 0.95,
        bbox: { x: 23 + t * 6, y: 64, w: 2.3, h: 5.0 },
        screenPos: { x: 24 + t * 6, y: 66 },
        pitchPos: { x: 25 + t * 10, y: 62 },
        velocity: { x: 0.9, y: -0.1 }, speedKmh: 11.2, distanceCoveredMeters: 390 + i * 6
      },
      {
        id: 'A5', name: 'Gvardiol', jerseyNumber: 24, team: 'teamA' as const, role: 'defender' as const,
        confidence: 0.93,
        bbox: { x: 28 + t * 10, y: 78, w: 2.4, h: 5.1 },
        screenPos: { x: 29 + t * 10, y: 80 },
        pitchPos: { x: 32 + t * 18, y: 82 },
        velocity: { x: 1.5, y: 0.2 }, speedKmh: 18.5, distanceCoveredMeters: 510 + i * 9
      },
      {
        id: 'A6', name: 'Rodri', jerseyNumber: 16, team: 'teamA' as const, role: 'midfielder' as const,
        confidence: 0.97,
        bbox: { x: 38 + t * 8, y: 52 + Math.sin(t * 5) * 4, w: 2.3, h: 5.0 },
        screenPos: { x: 39 + t * 8, y: 54 },
        pitchPos: { x: 42 + t * 12, y: 51 + Math.sin(t * 3) * 6 },
        velocity: { x: 1.1, y: 0.4 }, speedKmh: 13.8, distanceCoveredMeters: 620 + i * 8,
        hasPossession: i < 15
      },
      {
        id: 'A7', name: 'Stones', jerseyNumber: 5, team: 'teamA' as const, role: 'midfielder' as const,
        confidence: 0.92,
        bbox: { x: 36 + t * 9, y: 38, w: 2.3, h: 5.0 },
        screenPos: { x: 37 + t * 9, y: 40 },
        pitchPos: { x: 38 + t * 14, y: 35 },
        velocity: { x: 1.3, y: -0.2 }, speedKmh: 14.1, distanceCoveredMeters: 540 + i * 7
      },
      {
        id: 'A8', name: 'De Bruyne', jerseyNumber: 17, team: 'teamA' as const, role: 'midfielder' as const,
        confidence: 0.97,
        bbox: { x: 50 + t * 12, y: 36 + Math.sin(t * 4) * 5, w: 2.3, h: 5.0 },
        screenPos: { x: 51 + t * 12, y: 38 },
        pitchPos: { x: 58 + t * 16, y: 32 + Math.cos(t * 2) * 5 },
        velocity: { x: 1.7, y: -0.3 }, speedKmh: 21.0, distanceCoveredMeters: 680 + i * 11,
        hasPossession: i >= 15 && i < 30
      },
      {
        id: 'A9', name: 'Bernardo', jerseyNumber: 20, team: 'teamA' as const, role: 'midfielder' as const,
        confidence: 0.95,
        bbox: { x: 52 + t * 11, y: 66, w: 2.2, h: 4.9 },
        screenPos: { x: 53 + t * 11, y: 68 },
        pitchPos: { x: 60 + t * 15, y: 68 },
        velocity: { x: 1.4, y: 0.1 }, speedKmh: 17.2, distanceCoveredMeters: 640 + i * 9
      },
      {
        id: 'A10', name: 'Foden', jerseyNumber: 47, team: 'teamA' as const, role: 'forward' as const,
        confidence: 0.96,
        bbox: { x: 64 + t * 10, y: 28, w: 2.2, h: 4.8 },
        screenPos: { x: 65 + t * 10, y: 30 },
        pitchPos: { x: 74 + t * 12, y: 20 },
        velocity: { x: 1.8, y: -0.1 }, speedKmh: 24.3, distanceCoveredMeters: 710 + i * 12
      },
      {
        id: 'A11', name: 'Haaland', jerseyNumber: 9, team: 'teamA' as const, role: 'forward' as const,
        confidence: 0.98,
        bbox: { x: 68 + t * 8, y: 50, w: 2.5, h: 5.3 },
        screenPos: { x: 69 + t * 8, y: 52 },
        pitchPos: { x: 78 + t * 10, y: 50 + Math.sin(t * 3) * 4 },
        velocity: { x: 1.6, y: 0.2 }, speedKmh: 22.8, distanceCoveredMeters: 590 + i * 10,
        hasPossession: i >= 30
      },

      // TEAM B (Royal Red - 4-4-2 Mid-Block Pressing)
      {
        id: 'B1', name: 'Courtois', jerseyNumber: 1, team: 'teamB' as const, role: 'goalkeeper' as const,
        confidence: 0.98,
        bbox: { x: 92, y: 52, w: 2.4, h: 5.2 },
        screenPos: { x: 93, y: 54 },
        pitchPos: { x: 95, y: 50 },
        velocity: { x: -0.1, y: 0.0 }, speedKmh: 3.5, distanceCoveredMeters: 110 + i * 2
      },
      {
        id: 'B2', name: 'Carvajal', jerseyNumber: 2, team: 'teamB' as const, role: 'defender' as const,
        confidence: 0.94,
        bbox: { x: 78 - t * 4, y: 26, w: 2.3, h: 5.0 },
        screenPos: { x: 79 - t * 4, y: 28 },
        pitchPos: { x: 80 - t * 6, y: 22 },
        velocity: { x: -0.9, y: 0.2 }, speedKmh: 14.8, distanceCoveredMeters: 460 + i * 8
      },
      {
        id: 'B3', name: 'Rudiger', jerseyNumber: 22, team: 'teamB' as const, role: 'defender' as const,
        confidence: 0.96,
        bbox: { x: 79 - t * 3, y: 44, w: 2.4, h: 5.2 },
        screenPos: { x: 80 - t * 3, y: 46 },
        pitchPos: { x: 82 - t * 5, y: 42 },
        velocity: { x: -0.7, y: 0.1 }, speedKmh: 11.5, distanceCoveredMeters: 410 + i * 6
      },
      {
        id: 'B4', name: 'Alaba', jerseyNumber: 4, team: 'teamB' as const, role: 'defender' as const,
        confidence: 0.93,
        bbox: { x: 80 - t * 3, y: 60, w: 2.3, h: 5.0 },
        screenPos: { x: 81 - t * 3, y: 62 },
        pitchPos: { x: 83 - t * 5, y: 60 },
        velocity: { x: -0.8, y: -0.1 }, speedKmh: 12.0, distanceCoveredMeters: 430 + i * 7
      },
      {
        id: 'B5', name: 'Mendy', jerseyNumber: 23, team: 'teamB' as const, role: 'defender' as const,
        confidence: 0.92,
        bbox: { x: 77 - t * 5, y: 76, w: 2.3, h: 4.9 },
        screenPos: { x: 78 - t * 5, y: 78 },
        pitchPos: { x: 79 - t * 8, y: 80 },
        velocity: { x: -1.1, y: -0.2 }, speedKmh: 16.2, distanceCoveredMeters: 480 + i * 8
      },
      {
        id: 'B6', name: 'Valverde', jerseyNumber: 15, team: 'teamB' as const, role: 'midfielder' as const,
        confidence: 0.96,
        bbox: { x: 62 - t * 6, y: 30, w: 2.3, h: 5.0 },
        screenPos: { x: 63 - t * 6, y: 32 },
        pitchPos: { x: 65 - t * 8, y: 28 },
        velocity: { x: -1.4, y: 0.3 }, speedKmh: 19.5, distanceCoveredMeters: 620 + i * 10
      },
      {
        id: 'B7', name: 'Tchouameni', jerseyNumber: 18, team: 'teamB' as const, role: 'midfielder' as const,
        confidence: 0.95,
        bbox: { x: 64 - t * 5, y: 46, w: 2.3, h: 5.1 },
        screenPos: { x: 65 - t * 5, y: 48 },
        pitchPos: { x: 67 - t * 7, y: 45 },
        velocity: { x: -1.2, y: 0.1 }, speedKmh: 15.6, distanceCoveredMeters: 560 + i * 8
      },
      {
        id: 'B8', name: 'Kroos', jerseyNumber: 8, team: 'teamB' as const, role: 'midfielder' as const,
        confidence: 0.96,
        bbox: { x: 65 - t * 4, y: 58, w: 2.2, h: 4.9 },
        screenPos: { x: 66 - t * 4, y: 60 },
        pitchPos: { x: 68 - t * 6, y: 58 },
        velocity: { x: -0.9, y: -0.2 }, speedKmh: 12.8, distanceCoveredMeters: 520 + i * 7
      },
      {
        id: 'B9', name: 'Rodrygo', jerseyNumber: 11, team: 'teamB' as const, role: 'midfielder' as const,
        confidence: 0.94,
        bbox: { x: 60 - t * 6, y: 72, w: 2.2, h: 4.8 },
        screenPos: { x: 61 - t * 6, y: 74 },
        pitchPos: { x: 63 - t * 9, y: 74 },
        velocity: { x: -1.5, y: -0.2 }, speedKmh: 21.3, distanceCoveredMeters: 610 + i * 10
      },
      {
        id: 'B10', name: 'Bellingham', jerseyNumber: 5, team: 'teamB' as const, role: 'forward' as const,
        confidence: 0.97,
        bbox: { x: 48 - t * 5, y: 44, w: 2.4, h: 5.1 },
        screenPos: { x: 49 - t * 5, y: 46 },
        pitchPos: { x: 50 - t * 7, y: 42 },
        velocity: { x: -1.3, y: 0.4 }, speedKmh: 18.2, distanceCoveredMeters: 660 + i * 11
      },
      {
        id: 'B11', name: 'Vinicius Jr', jerseyNumber: 7, team: 'teamB' as const, role: 'forward' as const,
        confidence: 0.98,
        bbox: { x: 46 - t * 6, y: 62, w: 2.2, h: 4.9 },
        screenPos: { x: 47 - t * 6, y: 64 },
        pitchPos: { x: 48 - t * 8, y: 65 },
        velocity: { x: -1.8, y: -0.3 }, speedKmh: 25.4, distanceCoveredMeters: 740 + i * 13
      },

      // MATCH OFFICIAL
      {
        id: 'REF', name: 'Marciniak (Referee)', jerseyNumber: 0, team: 'neutral' as const, role: 'referee' as const,
        confidence: 0.97,
        bbox: { x: 44 + t * 6, y: 40, w: 2.0, h: 4.5 },
        screenPos: { x: 45 + t * 6, y: 42 },
        pitchPos: { x: 46 + t * 8, y: 38 },
        velocity: { x: 0.7, y: 0.1 }, speedKmh: 9.5, distanceCoveredMeters: 420 + i * 6
      }
    ];

    let phase: FrameData['phase'] = 'build_up';
    let eventTag: string | undefined = undefined;

    if (i === 15) {
      eventTag = 'Progressive Line-Breaking Pass: Rodri -> De Bruyne';
      phase = 'transitional';
    } else if (i === 30) {
      eventTag = 'Through-Ball into Box: De Bruyne -> Haaland';
      phase = 'counter_attack';
    } else if (i > 32) {
      phase = 'high_press';
      eventTag = 'Defensive Recovery Press: Rudiger & Alaba Double-Team';
    }

    frames.push({
      frameIndex: i,
      timestampSec: timeSec,
      timeDisplay: `${minStr}:${secStr}`,
      entities,
      ballPos: { x: ballX, y: ballY },
      possessionTeam: 'teamA',
      possessionPlayerId: i < 15 ? 'A6' : i < 30 ? 'A8' : 'A11',
      phase,
      eventTag,
      homographyCalibration
    });
  }

  return frames;
}

// ----------------------------------------------------
// 2. HOCKEY SAMPLE MATCH
// ----------------------------------------------------

const hockeyDimension: SportDimension = {
  name: 'Standard Field / Ice Hockey Rink',
  lengthMeters: 91.4,
  widthMeters: 55,
  pitchRatio: 91.4 / 55,
  surfaceTheme: 'ice',
  landmarks: [
    { name: 'Left Goal Line', pitchPos: { x: 5, y: 50 } },
    { name: 'Right Goal Line', pitchPos: { x: 95, y: 50 } },
    { name: 'Red Center Line', pitchPos: { x: 50, y: 50 } },
    { name: 'Left Blue Line', pitchPos: { x: 33, y: 50 } },
    { name: 'Right Blue Line', pitchPos: { x: 67, y: 50 } },
  ]
};

function generateHockeyFrames(): FrameData[] {
  const frames: FrameData[] = [];
  const totalFrames = 35;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const timeSec = Math.round(i * 0.4 * 10) / 10;
    const minStr = Math.floor(timeSec / 60).toString().padStart(2, '0');
    const secStr = Math.floor(timeSec % 60).toString().padStart(2, '0');

    const homographyCalibration = [
      { x: 10 + Math.sin(t) * 2, y: 18 },
      { x: 90 - Math.sin(t) * 2, y: 18 },
      { x: 98, y: 84 },
      { x: 2, y: 84 }
    ];

    const ballX = 40 + t * 45 + Math.sin(t * 8) * 5;
    const ballY = 45 + Math.cos(t * 6) * 25;

    const entities = [
      // TEAM A: Avalanche Storm (1-3-1 Power Play)
      { id: 'H_A1', name: 'Kuemper (G)', jerseyNumber: 35, team: 'teamA' as const, role: 'goalkeeper' as const, confidence: 0.99, bbox: { x: 10, y: 50, w: 2.5, h: 5.0 }, screenPos: { x: 11, y: 52 }, pitchPos: { x: 8, y: 50 }, velocity: { x: 0.1, y: 0.1 }, speedKmh: 5.0, distanceCoveredMeters: 90 + i * 2 },
      { id: 'H_A2', name: 'Makar (Point)', jerseyNumber: 8, team: 'teamA' as const, role: 'defender' as const, confidence: 0.98, bbox: { x: 36 + t * 10, y: 50, w: 2.3, h: 4.8 }, screenPos: { x: 37 + t * 10, y: 52 }, pitchPos: { x: 42 + t * 15, y: 50 }, velocity: { x: 1.6, y: 0.0 }, speedKmh: 26.2, distanceCoveredMeters: 480 + i * 12, hasPossession: i < 12 },
      { id: 'H_A3', name: 'Rantanen (Left Half-Wall)', jerseyNumber: 96, team: 'teamA' as const, role: 'forward' as const, confidence: 0.95, bbox: { x: 50 + t * 12, y: 25, w: 2.3, h: 4.8 }, screenPos: { x: 51 + t * 12, y: 27 }, pitchPos: { x: 62 + t * 16, y: 20 }, velocity: { x: 1.8, y: 0.3 }, speedKmh: 28.5, distanceCoveredMeters: 550 + i * 14, hasPossession: i >= 12 && i < 24 },
      { id: 'H_A4', name: 'MacKinnon (Bumper)', jerseyNumber: 29, team: 'teamA' as const, role: 'forward' as const, confidence: 0.97, bbox: { x: 56 + t * 14, y: 52, w: 2.4, h: 4.9 }, screenPos: { x: 57 + t * 14, y: 54 }, pitchPos: { x: 68 + t * 18, y: 50 }, velocity: { x: 2.0, y: 0.2 }, speedKmh: 31.0, distanceCoveredMeters: 620 + i * 16 },
      { id: 'H_A5', name: 'Nichushkin (Net-Front)', jerseyNumber: 13, team: 'teamA' as const, role: 'forward' as const, confidence: 0.94, bbox: { x: 74 + t * 8, y: 48, w: 2.6, h: 5.2 }, screenPos: { x: 75 + t * 8, y: 50 }, pitchPos: { x: 86 + t * 8, y: 48 }, velocity: { x: 1.2, y: 0.4 }, speedKmh: 19.4, distanceCoveredMeters: 390 + i * 9 },
      { id: 'H_A6', name: 'Landeskog (Right Half-Wall)', jerseyNumber: 92, team: 'teamA' as const, role: 'forward' as const, confidence: 0.96, bbox: { x: 52 + t * 10, y: 75, w: 2.3, h: 4.8 }, screenPos: { x: 53 + t * 10, y: 77 }, pitchPos: { x: 64 + t * 14, y: 80 }, velocity: { x: 1.5, y: -0.2 }, speedKmh: 24.1, distanceCoveredMeters: 510 + i * 11, hasPossession: i >= 24 },

      // TEAM B: Lightning Bolts (2-1-2 Penalty Kill Box)
      { id: 'H_B1', name: 'Vasilevskiy (G)', jerseyNumber: 88, team: 'teamB' as const, role: 'goalkeeper' as const, confidence: 0.99, bbox: { x: 88, y: 50, w: 2.6, h: 5.2 }, screenPos: { x: 89, y: 52 }, pitchPos: { x: 92, y: 50 }, velocity: { x: -0.1, y: 0.2 }, speedKmh: 6.2, distanceCoveredMeters: 100 + i * 2 },
      { id: 'H_B2', name: 'Hedman (D)', jerseyNumber: 77, team: 'teamB' as const, role: 'defender' as const, confidence: 0.97, bbox: { x: 76 - t * 4, y: 35, w: 2.5, h: 5.1 }, screenPos: { x: 77 - t * 4, y: 37 }, pitchPos: { x: 80 - t * 6, y: 34 }, velocity: { x: -1.2, y: 0.4 }, speedKmh: 21.0, distanceCoveredMeters: 440 + i * 10 },
      { id: 'H_B3', name: 'Cernak (D)', jerseyNumber: 81, team: 'teamB' as const, role: 'defender' as const, confidence: 0.95, bbox: { x: 77 - t * 4, y: 65, w: 2.4, h: 5.0 }, screenPos: { x: 78 - t * 4, y: 67 }, pitchPos: { x: 81 - t * 6, y: 66 }, velocity: { x: -1.1, y: -0.3 }, speedKmh: 19.8, distanceCoveredMeters: 420 + i * 9 },
      { id: 'H_B4', name: 'Cirelli (F)', jerseyNumber: 71, team: 'teamB' as const, role: 'forward' as const, confidence: 0.96, bbox: { x: 62 - t * 6, y: 42, w: 2.3, h: 4.8 }, screenPos: { x: 63 - t * 6, y: 44 }, pitchPos: { x: 66 - t * 8, y: 40 }, velocity: { x: -1.5, y: 0.2 }, speedKmh: 25.5, distanceCoveredMeters: 530 + i * 12 },
      { id: 'H_B5', name: 'Paul (F)', jerseyNumber: 20, team: 'teamB' as const, role: 'forward' as const, confidence: 0.94, bbox: { x: 63 - t * 5, y: 60, w: 2.3, h: 4.8 }, screenPos: { x: 64 - t * 5, y: 62 }, pitchPos: { x: 67 - t * 7, y: 60 }, velocity: { x: -1.4, y: -0.2 }, speedKmh: 23.9, distanceCoveredMeters: 510 + i * 11 },
    ];

    frames.push({
      frameIndex: i,
      timestampSec: timeSec,
      timeDisplay: `${minStr}:${secStr}`,
      entities,
      ballPos: { x: ballX, y: ballY },
      possessionTeam: 'teamA',
      possessionPlayerId: i < 12 ? 'H_A2' : i < 24 ? 'H_A3' : 'H_A6',
      phase: i < 12 ? 'build_up' : i < 24 ? 'counter_attack' : 'settled_defense',
      eventTag: i === 12 ? 'One-Touch Cross-Seam Pass to Left Half-Wall' : i === 24 ? 'Slot Shot Attempt through Bumper Channel' : undefined,
      homographyCalibration
    });
  }

  return frames;
}

// ----------------------------------------------------
// PASSING NETWORKS & BASE METRICS
// ----------------------------------------------------

const footballPassingNetworkA: PassingNetworkData = {
  nodes: [
    { id: 'A1', name: 'Ederson', jerseyNumber: 31, avgPitchPos: { x: 8, y: 50 }, touches: 32, centrality: 0.28, role: 'goalkeeper', team: 'teamA' },
    { id: 'A2', name: 'Walker', jerseyNumber: 2, avgPitchPos: { x: 36, y: 22 }, touches: 64, centrality: 0.58, role: 'defender', team: 'teamA' },
    { id: 'A3', name: 'Dias', jerseyNumber: 3, avgPitchPos: { x: 30, y: 44 }, touches: 78, centrality: 0.72, role: 'defender', team: 'teamA' },
    { id: 'A4', name: 'Akanji', jerseyNumber: 25, avgPitchPos: { x: 31, y: 62 }, touches: 72, centrality: 0.68, role: 'defender', team: 'teamA' },
    { id: 'A5', name: 'Gvardiol', jerseyNumber: 24, avgPitchPos: { x: 42, y: 82 }, touches: 69, centrality: 0.62, role: 'defender', team: 'teamA' },
    { id: 'A6', name: 'Rodri', jerseyNumber: 16, avgPitchPos: { x: 48, y: 51 }, touches: 104, centrality: 0.96, role: 'midfielder', team: 'teamA' },
    { id: 'A7', name: 'Stones', jerseyNumber: 5, avgPitchPos: { x: 45, y: 35 }, touches: 58, centrality: 0.54, role: 'midfielder', team: 'teamA' },
    { id: 'A8', name: 'De Bruyne', jerseyNumber: 17, avgPitchPos: { x: 66, y: 32 }, touches: 84, centrality: 0.88, role: 'midfielder', team: 'teamA' },
    { id: 'A9', name: 'Bernardo', jerseyNumber: 20, avgPitchPos: { x: 67, y: 68 }, touches: 76, centrality: 0.74, role: 'midfielder', team: 'teamA' },
    { id: 'A10', name: 'Foden', jerseyNumber: 47, avgPitchPos: { x: 80, y: 20 }, touches: 52, centrality: 0.49, role: 'forward', team: 'teamA' },
    { id: 'A11', name: 'Haaland', jerseyNumber: 9, avgPitchPos: { x: 84, y: 50 }, touches: 28, centrality: 0.35, role: 'forward', team: 'teamA' },
  ],
  edges: [
    { fromId: 'A3', toId: 'A6', count: 28, successRate: 96, avgDistanceMeters: 18.5, xThreatGained: 0.08 },
    { fromId: 'A4', toId: 'A6', count: 24, successRate: 94, avgDistanceMeters: 17.2, xThreatGained: 0.07 },
    { fromId: 'A6', toId: 'A8', count: 32, successRate: 89, avgDistanceMeters: 22.4, xThreatGained: 0.24 },
    { fromId: 'A6', toId: 'A9', count: 21, successRate: 92, avgDistanceMeters: 21.0, xThreatGained: 0.16 },
    { fromId: 'A8', toId: 'A10', count: 19, successRate: 84, avgDistanceMeters: 16.8, xThreatGained: 0.31 },
    { fromId: 'A8', toId: 'A11', count: 14, successRate: 78, avgDistanceMeters: 24.1, xThreatGained: 0.42 },
    { fromId: 'A2', toId: 'A8', count: 18, successRate: 91, avgDistanceMeters: 20.3, xThreatGained: 0.19 },
    { fromId: 'A5', toId: 'A9', count: 16, successRate: 88, avgDistanceMeters: 23.5, xThreatGained: 0.18 },
  ],
  dominantChannnel: 'Right Half-Space',
  passAccuracy: 88.6,
  directnessIndex: 42
};

const footballPassingNetworkB: PassingNetworkData = {
  nodes: [
    { id: 'B1', name: 'Courtois', jerseyNumber: 1, avgPitchPos: { x: 94, y: 50 }, touches: 24, centrality: 0.22, role: 'goalkeeper', team: 'teamB' },
    { id: 'B2', name: 'Carvajal', jerseyNumber: 2, avgPitchPos: { x: 76, y: 24 }, touches: 42, centrality: 0.44, role: 'defender', team: 'teamB' },
    { id: 'B3', name: 'Rudiger', jerseyNumber: 22, avgPitchPos: { x: 79, y: 42 }, touches: 51, centrality: 0.52, role: 'defender', team: 'teamB' },
    { id: 'B4', name: 'Alaba', jerseyNumber: 4, avgPitchPos: { x: 80, y: 60 }, touches: 48, centrality: 0.50, role: 'defender', team: 'teamB' },
    { id: 'B5', name: 'Mendy', jerseyNumber: 23, avgPitchPos: { x: 74, y: 78 }, touches: 39, centrality: 0.38, role: 'defender', team: 'teamB' },
    { id: 'B6', name: 'Valverde', jerseyNumber: 15, avgPitchPos: { x: 60, y: 28 }, touches: 55, centrality: 0.62, role: 'midfielder', team: 'teamB' },
    { id: 'B7', name: 'Tchouameni', jerseyNumber: 18, avgPitchPos: { x: 62, y: 46 }, touches: 61, centrality: 0.68, role: 'midfielder', team: 'teamB' },
    { id: 'B8', name: 'Kroos', jerseyNumber: 8, avgPitchPos: { x: 64, y: 58 }, touches: 74, centrality: 0.85, role: 'midfielder', team: 'teamB' },
    { id: 'B9', name: 'Rodrygo', jerseyNumber: 11, avgPitchPos: { x: 58, y: 74 }, touches: 45, centrality: 0.48, role: 'midfielder', team: 'teamB' },
    { id: 'B10', name: 'Bellingham', jerseyNumber: 5, avgPitchPos: { x: 46, y: 42 }, touches: 59, centrality: 0.76, role: 'forward', team: 'teamB' },
    { id: 'B11', name: 'Vinicius Jr', jerseyNumber: 7, avgPitchPos: { x: 44, y: 65 }, touches: 54, centrality: 0.71, role: 'forward', team: 'teamB' },
  ],
  edges: [
    { fromId: 'B8', toId: 'B11', count: 18, successRate: 85, avgDistanceMeters: 31.2, xThreatGained: 0.38 },
    { fromId: 'B8', toId: 'B10', count: 22, successRate: 91, avgDistanceMeters: 22.0, xThreatGained: 0.26 },
    { fromId: 'B7', toId: 'B6', count: 15, successRate: 88, avgDistanceMeters: 19.4, xThreatGained: 0.14 },
    { fromId: 'B10', toId: 'B11', count: 12, successRate: 82, avgDistanceMeters: 16.5, xThreatGained: 0.35 },
  ],
  dominantChannnel: 'Left Wing',
  passAccuracy: 84.1,
  directnessIndex: 68
};

// ----------------------------------------------------
// EXPORT ALL SAMPLE MATCHES
// ----------------------------------------------------

export const SAMPLE_MATCHES: Record<SportType, SampleMatch> = {
  football: {
    id: 'match-football-01',
    name: 'Champions League: Manchester Sky Blues vs Real Royal Madrid',
    sport: 'football',
    description: 'High-speed 2D broadcast camera tracking analyzing 4-3-3 positional build-up against a compact 4-4-2 mid-block.',
    teamA: {
      id: 'mci',
      name: 'Sky Blues',
      shortName: 'MCI',
      primaryColor: '#0ea5e9', // sky-500
      secondaryColor: '#38bdf8',
      textColor: '#ffffff',
      formation: '4-3-3 (3-2-4-1 build-up)',
      sport: 'football'
    },
    teamB: {
      id: 'rma',
      name: 'Royal Madrid',
      shortName: 'RMA',
      primaryColor: '#ef4444', // red-500
      secondaryColor: '#f87171',
      textColor: '#ffffff',
      formation: '4-4-2 Mid-Block',
      sport: 'football'
    },
    durationSec: 18,
    fps: 2.5,
    frames: generateFootballFrames(),
    passingNetworkA: footballPassingNetworkA,
    passingNetworkB: footballPassingNetworkB,
    baseMetrics: {
      possessionA: 64,
      possessionB: 36,
      pitchControlA: 61,
      pitchControlB: 39,
      ppdaTeamA: 8.4,
      ppdaTeamB: 14.2,
      compactnessA: {
        lineDepthMeters: 32.4,
        teamWidthMeters: 46.8,
        convexHullAreaSqM: 1140
      },
      compactnessB: {
        lineDepthMeters: 24.1,
        teamWidthMeters: 38.5,
        convexHullAreaSqM: 820
      },
      expectedThreatTeamA: 1.84,
      expectedThreatTeamB: 0.95,
      defensiveTransitionsCount: 14,
      keyRecoveryZonesCount: 8,
      detectedFormationA: '3-2-4-1 Inverted',
      detectedFormationB: '4-4-2 Compact'
    },
    dimension: footballDimension,
    videoPlaceholderTheme: 'football'
  },

  hockey: {
    id: 'match-hockey-01',
    name: 'Pro Hockey: Avalanche Storm vs Lightning Bolts',
    sport: 'hockey',
    description: 'Special teams power-play tracking showing 1-3-1 perimeter puck movement vs 2-1-2 defensive diamond penalty kill.',
    teamA: {
      id: 'col',
      name: 'Avalanche Storm',
      shortName: 'COL',
      primaryColor: '#6366f1', // indigo-500
      secondaryColor: '#818cf8',
      textColor: '#ffffff',
      formation: '1-3-1 Power Play',
      sport: 'hockey'
    },
    teamB: {
      id: 'tbl',
      name: 'Lightning Bolts',
      shortName: 'TBL',
      primaryColor: '#f59e0b', // amber-500
      secondaryColor: '#fbbf24',
      textColor: '#ffffff',
      formation: '2-1-2 Box Trap',
      sport: 'hockey'
    },
    durationSec: 14,
    fps: 2.5,
    frames: generateHockeyFrames(),
    passingNetworkA: {
      nodes: [
        { id: 'H_A1', name: 'Kuemper (G)', jerseyNumber: 35, avgPitchPos: { x: 8, y: 50 }, touches: 12, centrality: 0.15, role: 'goalkeeper', team: 'teamA' },
        { id: 'H_A2', name: 'Makar (Point)', jerseyNumber: 8, avgPitchPos: { x: 46, y: 50 }, touches: 48, centrality: 0.92, role: 'defender', team: 'teamA' },
        { id: 'H_A3', name: 'Rantanen', jerseyNumber: 96, avgPitchPos: { x: 68, y: 22 }, touches: 41, centrality: 0.81, role: 'forward', team: 'teamA' },
        { id: 'H_A4', name: 'MacKinnon', jerseyNumber: 29, avgPitchPos: { x: 72, y: 50 }, touches: 45, centrality: 0.88, role: 'forward', team: 'teamA' },
        { id: 'H_A5', name: 'Nichushkin', jerseyNumber: 13, avgPitchPos: { x: 88, y: 48 }, touches: 22, centrality: 0.42, role: 'forward', team: 'teamA' },
        { id: 'H_A6', name: 'Landeskog', jerseyNumber: 92, avgPitchPos: { x: 69, y: 78 }, touches: 38, centrality: 0.76, role: 'forward', team: 'teamA' },
      ],
      edges: [
        { fromId: 'H_A2', toId: 'H_A3', count: 24, successRate: 96, avgDistanceMeters: 18.2, xThreatGained: 0.28 },
        { fromId: 'H_A2', toId: 'H_A6', count: 19, successRate: 94, avgDistanceMeters: 19.5, xThreatGained: 0.22 },
        { fromId: 'H_A3', toId: 'H_A4', count: 16, successRate: 85, avgDistanceMeters: 12.0, xThreatGained: 0.38 },
        { fromId: 'H_A4', toId: 'H_A5', count: 11, successRate: 75, avgDistanceMeters: 9.8, xThreatGained: 0.52 },
      ],
      dominantChannnel: 'Left Wing',
      passAccuracy: 91.2,
      directnessIndex: 58
    },
    passingNetworkB: {
      nodes: [
        { id: 'H_B1', name: 'Vasilevskiy (G)', jerseyNumber: 88, avgPitchPos: { x: 92, y: 50 }, touches: 18, centrality: 0.20, role: 'goalkeeper', team: 'teamB' },
        { id: 'H_B2', name: 'Hedman (D)', jerseyNumber: 77, avgPitchPos: { x: 78, y: 34 }, touches: 28, centrality: 0.65, role: 'defender', team: 'teamB' },
        { id: 'H_B3', name: 'Cernak (D)', jerseyNumber: 81, avgPitchPos: { x: 79, y: 66 }, touches: 24, centrality: 0.60, role: 'defender', team: 'teamB' },
        { id: 'H_B4', name: 'Cirelli (F)', jerseyNumber: 71, avgPitchPos: { x: 64, y: 40 }, touches: 21, centrality: 0.55, role: 'forward', team: 'teamB' },
        { id: 'H_B5', name: 'Paul (F)', jerseyNumber: 20, avgPitchPos: { x: 65, y: 60 }, touches: 19, centrality: 0.52, role: 'forward', team: 'teamB' },
      ],
      edges: [
        { fromId: 'H_B2', toId: 'H_B4', count: 9, successRate: 78, avgDistanceMeters: 14.5, xThreatGained: 0.19 }
      ],
      dominantChannnel: 'Center',
      passAccuracy: 79.4,
      directnessIndex: 72
    },
    baseMetrics: {
      possessionA: 72,
      possessionB: 28,
      pitchControlA: 68,
      pitchControlB: 32,
      ppdaTeamA: 5.2,
      ppdaTeamB: 18.0,
      compactnessA: {
        lineDepthMeters: 28.5,
        teamWidthMeters: 32.0,
        convexHullAreaSqM: 620
      },
      compactnessB: {
        lineDepthMeters: 18.2,
        teamWidthMeters: 22.4,
        convexHullAreaSqM: 340
      },
      expectedThreatTeamA: 2.45,
      expectedThreatTeamB: 0.42,
      defensiveTransitionsCount: 9,
      keyRecoveryZonesCount: 6,
      detectedFormationA: '1-3-1 Umbrella',
      detectedFormationB: '2-1-2 Box'
    },
    dimension: hockeyDimension,
    videoPlaceholderTheme: 'hockey'
  }
};
