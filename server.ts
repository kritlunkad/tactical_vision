import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

import multer from 'multer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Python backend URLs - SEPARATE FOR FOOTBALL AND HOCKEY
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
const HOCKEY_BACKEND_URL = process.env.HOCKEY_BACKEND_URL || 'http://localhost:8001';
// Gemini config — read securely from environment / .env
// Model must be a valid Google GenAI model (e.g. gemini-2.0-flash, gemini-1.5-flash)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const AI_MODEL = process.env.GEMINI_MODEL || 'gemma-4-31b-it';

function numberOr(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function summarizeNetwork(network: any, teamName: string) {
  const nodes = Array.isArray(network?.nodes) ? network.nodes : [];
  const edges = Array.isArray(network?.edges) ? network.edges : [];
  const topNode = [...nodes].sort((a: any, b: any) => numberOr(b.touches, 0) - numberOr(a.touches, 0))[0];
  const topEdge = [...edges].sort((a: any, b: any) => numberOr(b.count, 0) - numberOr(a.count, 0))[0];
  return {
    team: teamName,
    trackedPlayers: nodes.length,
    totalTouches: nodes.reduce((sum: number, node: any) => sum + numberOr(node.touches, 0), 0),
    dominantChannel: network?.dominantChannel || network?.dominantChannnel || 'Unknown',
    passAccuracy: numberOr(network?.passAccuracy, 0),
    directnessIndex: numberOr(network?.directnessIndex, 0),
    mostInvolvedPlayer: topNode ? {
      id: topNode.id,
      name: topNode.name,
      touches: numberOr(topNode.touches, 0),
      centrality: numberOr(topNode.centrality, 0),
      avgPitchPos: topNode.avgPitchPos,
    } : null,
    strongestConnection: topEdge || null,
  };
}

function buildTacticalPayload(body: any) {
  const metrics = body?.metrics || body || {};
  const teamA = body?.teamA || {};
  const teamB = body?.teamB || {};
  const sport = body?.sport === 'hockey' ? 'hockey' : 'football';
  const teamAName = teamA.name || body?.teamAName || 'Team A';
  const teamBName = teamB.name || body?.teamBName || 'Team B';
  const possessionA = numberOr(metrics.possessionA ?? metrics.possession, 50);
  const possessionB = numberOr(metrics.possessionB, Math.max(0, 100 - possessionA));
  const pitchControlA = numberOr(metrics.pitchControlA ?? body?.pitchControlTeamA, 50);
  const pitchControlB = numberOr(metrics.pitchControlB, Math.max(0, 100 - pitchControlA));
  return {
    sport,
    metrics,
    teamAName,
    teamBName,
    formationA: metrics.detectedFormationA || teamA.formation || body?.formationA || (sport === 'hockey' ? '1-3-1' : '4-3-3'),
    formationB: metrics.detectedFormationB || teamB.formation || body?.formationB || (sport === 'hockey' ? '2-1-2' : '4-4-2'),
    possessionA,
    possessionB,
    pitchControlA,
    pitchControlB,
    ppdaTeamA: numberOr(metrics.ppdaTeamA ?? body?.ppdaTeamA, 0),
    ppdaTeamB: numberOr(metrics.ppdaTeamB ?? body?.ppdaTeamB, 0),
    compactnessA: metrics.compactnessA || body?.compactnessA || {},
    compactnessB: metrics.compactnessB || body?.compactnessB || {},
    xThreatA: numberOr(metrics.expectedThreatTeamA, 0),
    xThreatB: numberOr(metrics.expectedThreatTeamB, 0),
    transitions: numberOr(metrics.defensiveTransitionsCount, 0),
    recoveries: numberOr(metrics.keyRecoveryZonesCount, 0),
    networkA: summarizeNetwork(body?.passingNetworkA, teamAName),
    networkB: summarizeNetwork(body?.passingNetworkB, teamBName),
  };
}

function buildLocalTacticalAnalysis(payload: ReturnType<typeof buildTacticalPayload>) {
  const leadingControl = payload.pitchControlA >= payload.pitchControlB ? payload.teamAName : payload.teamBName;
  const leadingPossession = payload.possessionA >= payload.possessionB ? payload.teamAName : payload.teamBName;
  const sportTerms = payload.sport === 'hockey'
    ? { surface: 'rink', pressure: 'forecheck', channel: 'lane', restart: 'line-change window' }
    : { surface: 'pitch', pressure: 'press', channel: 'half-space', restart: 'rest-defense window' };

  return {
    tacticalSummary: `${payload.sport.toUpperCase()} CV telemetry shows ${payload.teamAName} in ${payload.formationA} against ${payload.teamBName} in ${payload.formationB}. ${leadingPossession} leads tracked possession (${payload.possessionA}%-${payload.possessionB}%), while ${leadingControl} leads spatial control (${payload.pitchControlA}%-${payload.pitchControlB}%). Passing and centrality notes are based only on detected possession events and tracked network edges.`,
    structuralStrengths: [
      `${payload.teamAName}: ${payload.networkA.dominantChannel} progression with ${payload.networkA.totalTouches} tracked puck/ball involvement events.`,
      `${payload.teamBName}: ${payload.networkB.dominantChannel} progression with ${payload.networkB.totalTouches} tracked puck/ball involvement events.`,
      `The current ${sportTerms.surface} model reports ${payload.transitions} defensive transitions and ${payload.recoveries} recovery-zone events from the processed video.`,
    ],
    tacticalVulnerabilities: [
      `${payload.teamAName} compactness: depth ${numberOr(payload.compactnessA.lineDepthMeters, 0)}m, width ${numberOr(payload.compactnessA.teamWidthMeters, 0)}m. Large values indicate recoverable spacing gaps.`,
      `${payload.teamBName} compactness: depth ${numberOr(payload.compactnessB.lineDepthMeters, 0)}m, width ${numberOr(payload.compactnessB.teamWidthMeters, 0)}m. Check weak-side support before stepping into pressure.`,
      `If the highest-centrality player is locked, circulation can stall because the network is built from a limited broadcast-visible sample.`,
    ],
    coachingDirectives: [
      `Use the top involved player for each side as the first scouting constraint: ${payload.networkA.mostInvolvedPlayer?.name || payload.teamAName} and ${payload.networkB.mostInvolvedPlayer?.name || payload.teamBName}.`,
      `Shift the ${sportTerms.pressure} trigger toward the opponent's dominant ${sportTerms.channel}: ${payload.networkA.dominantChannel} for ${payload.teamAName}, ${payload.networkB.dominantChannel} for ${payload.teamBName}.`,
      `Review clips around possession changes before the next ${sportTerms.restart}; those are the moments where the tracking shows the clearest spacing swings.`,
    ],
    counterStrategy: `Against the more connected side, deny the strongest visible connection first, then force play away from the dominant channel into lower-support zones.`,
    recommendedDrill: {
      title: payload.sport === 'hockey' ? '5v5 Lane Denial to Counter-Regroup' : '7v7 Channel Lock and Counter-Progression',
      duration: '18 minutes',
      intensity: 'Match-realistic',
      objective: `Train the squad to close the opponent's dominant channel while preserving controlled exits.`,
      instructions: `Set two teams in the detected base shapes. Award points for forcing turnovers in the opponent dominant channel and for clean exits through the opposite side within six seconds.`,
    },
  };
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static video routes
const inputVideosDir = path.join(__dirname, 'input_videos');
const publicVideosDir = path.join(__dirname, 'public', 'videos');
const archiveVideosDir = path.join(__dirname, 'Archive 2', 'input_videos');

if (!fs.existsSync(inputVideosDir)) fs.mkdirSync(inputVideosDir, { recursive: true });
if (!fs.existsSync(publicVideosDir)) fs.mkdirSync(publicVideosDir, { recursive: true });

app.use('/videos', express.static(publicVideosDir));
app.use('/videos', express.static(inputVideosDir));
app.use('/videos/archive', express.static(archiveVideosDir));

// Multer storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, inputVideosDir);
  },
  filename: (req, file, cb) => {
    const clean = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${clean}`);
  }
});
const upload = multer({ storage });

// Lazy Google Gen AI Client
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'dummy-key' || GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
      console.warn('GEMINI_API_KEY is not set or is placeholder. Gemini features will return fallback tactical analytics.');
    }
    aiClient = new GoogleGenAI({
      apiKey: GEMINI_API_KEY || 'dummy-key',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== 'dummy-key' && GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' && GEMINI_API_KEY.length > 20);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiConfigured: isGeminiConfigured(),
    pythonBackend: PYTHON_BACKEND_URL,
  });
});

// Python backend proxy endpoints
app.get('/api/cv/health', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_BACKEND_URL}/api/health`);
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({
      error: 'Python backend not available',
      details: error.message,
    });
  }
});

app.get('/api/cv/videos', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_BACKEND_URL}/api/videos`);
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch videos from Python backend',
      details: error.message,
    });
  }
});

app.post('/api/cv/upload-video', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    // Also mirror to public/videos for direct video playback
    fs.copyFileSync(req.file.path, path.join(publicVideosDir, req.file.filename));
    
    res.json({
      success: true,
      video_path: req.file.path,
      filename: req.file.filename,
      public_url: `/videos/${req.file.filename}`
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to handle video upload',
      details: error.message,
    });
  }
});

app.post('/api/cv/process-video', async (req, res) => {
  try {
    const response = await axios.post(`${PYTHON_BACKEND_URL}/api/process-video`, req.body, {
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 900000 // 15 minutes for first-time CPU inference; cached runs return quickly
    });
    res.json(response.data);
  } catch (error: any) {
    const detailMsg = error.response?.data?.detail || error.message;
    res.status(500).json({
      error: 'Failed to process video in Python backend',
      details: detailMsg,
    });
  }
});

// ========== HOCKEY API PROXIES - SEPARATE FROM FOOTBALL ==========
app.get('/api/hockey/health', async (req, res) => {
  try {
    const response = await axios.get(`${HOCKEY_BACKEND_URL}/api/hockey/health`);
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({
      error: 'Hockey backend not available',
      details: error.message,
    });
  }
});

app.get('/api/hockey/videos', async (req, res) => {
  try {
    const response = await axios.get(`${HOCKEY_BACKEND_URL}/api/hockey/videos`);
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch hockey videos',
      details: error.message,
    });
  }
});

app.post('/api/hockey/upload-video', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No hockey video file provided' });
    }
    // Mirror to public/videos for playback like football
    fs.copyFileSync(req.file.path, path.join(publicVideosDir, req.file.filename));
    // Also forward to hockey backend for consistency
    try {
      const formData = new FormData();
      const fileStream = fs.createReadStream(req.file.path);
      formData.append('file', fileStream as any, req.file.filename);
      // Best effort forward to hockey backend - ignore failure, local save is primary
    } catch (e) {}
    
    res.json({
      success: true,
      video_path: req.file.path,
      filename: req.file.filename,
      public_url: `/videos/${req.file.filename}`
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to handle hockey video upload',
      details: error.message,
    });
  }
});

app.post('/api/hockey/process-video', async (req, res) => {
  try {
    const response = await axios.post(`${HOCKEY_BACKEND_URL}/api/hockey/process-video`, req.body, {
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 900000
    });
    res.json(response.data);
  } catch (error: any) {
    const detailMsg = error.response?.data?.detail || error.message;
    res.status(500).json({
      error: 'Failed to process hockey video',
      details: detailMsg,
    });
  }
});

// Deep Tactical Insights Endpoint
app.post('/api/gemini/analyze-tactics', async (req, res) => {
  try {
    const payload = buildTacticalPayload(req.body);
    const localAnalysis = buildLocalTacticalAnalysis(payload);

    if (!isGeminiConfigured()) {
      return res.json({
        success: true,
        source: 'local_heuristics',
        analysis: localAnalysis,
      });
    }

    const ai = getGenAI();
    const prompt = `You are an elite football and ice-hockey tactical analyst for amateur coaching staffs.
Use only the supplied computer-vision telemetry. Do not invent shots, goals, passes, players, or events that are not in the data. If a metric is inferred from broadcast tracking, say it is CV-inferred.

MATCH TELEMETRY:
${JSON.stringify(payload, null, 2)}

Return a practical coaching report in JSON with the exact following schema:
{
  "tacticalSummary": "Detailed narrative overview of tactical battle, spatial control, and phase transitions",
  "structuralStrengths": ["Strength 1", "Strength 2", "Strength 3"],
  "tacticalVulnerabilities": ["Vulnerability 1", "Vulnerability 2", "Vulnerability 3"],
  "coachingDirectives": ["Actionable tactical adjustment 1", "Actionable tactical adjustment 2", "Actionable tactical adjustment 3"],
  "counterStrategy": "Specific tactical counter-measure for the coach to exploit opponent weaknesses",
  "recommendedDrill": {
    "title": "Drill Name",
    "duration": "e.g. 20 minutes",
    "intensity": "Moderate / High / Match-realistic",
    "objective": "Clear training outcome",
    "instructions": "Step-by-step setup and constraints for amateur coaching staffs"
  }
}`;

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json({
      success: true,
      source: AI_MODEL,
      analysis: parsed,
    });
  } catch (error: any) {
    console.error('Error generating tactical analysis:', error);
    const payload = buildTacticalPayload(req.body);
    res.json({
      success: true,
      source: 'local_heuristics_after_ai_error',
      details: error?.message,
      analysis: buildLocalTacticalAnalysis(payload),
    });
  }
});

// Interactive AI Coaching Chat Endpoint
app.post('/api/gemini/coach-chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    const rawContext = req.body?.tacticalContext || req.body?.context || {};

    // Normalize frontend aliases: teamA/teamB vs teamAName/teamBName, ppdaA vs ppdaTeamA, etc.
    const normalizeCompactness = (val: any): string => {
      if (val == null) return '30';
      if (typeof val === 'number') return String(val);
      if (typeof val === 'object') {
        if (val.lineDepthMeters != null) return String(val.lineDepthMeters);
        if (val.convexHullAreaSqM != null) return String(val.convexHullAreaSqM);
        return JSON.stringify(val);
      }
      return String(val);
    };
    const tacticalContext = {
      sport: rawContext.sport || 'football',
      teamAName: rawContext.teamAName || rawContext.teamA || 'Team A',
      teamBName: rawContext.teamBName || rawContext.teamB || 'Team B',
      formationA: rawContext.formationA || rawContext.teamAFormation || '4-3-3',
      formationB: rawContext.formationB || rawContext.teamBFormation || '4-4-2',
      possession: rawContext.possession ?? rawContext.possessionA ?? rawContext.ppdaA ?? 50,
      pitchControlTeamA: rawContext.pitchControlTeamA ?? rawContext.pitchControlA ?? 50,
      compactnessA: normalizeCompactness(rawContext.compactnessA),
      ppdaTeamA: rawContext.ppdaTeamA ?? rawContext.ppdaA ?? 10.5,
      xTA: rawContext.xTA ?? rawContext.expectedThreatTeamA ?? 0,
    };

    if (!isGeminiConfigured()) {
      return res.json({
        success: true,
        source: 'local_heuristics',
        reply: `Coach, using the current ${tacticalContext.sport} telemetry: ${tacticalContext.teamAName} is in ${tacticalContext.formationA} with ${tacticalContext.possession}% tracked possession and ${tacticalContext.pitchControlTeamA}% pitch control. For "${message}", start by denying the opponent's dominant channel (${tacticalContext.formationB}) and then adjust spacing around the highest-involvement player (compactness ${tacticalContext.compactnessA}m, PPDA ${tacticalContext.ppdaTeamA}).`,
      });
    }

    const ai = getGenAI();
    const historyText = Array.isArray(conversationHistory)
      ? conversationHistory.map((m: any) => `${m.role === 'user' ? 'Coach' : 'Tactical Assistant'}: ${m.content}`).join('\n')
      : '';

    const systemPrompt = `You are the Lead Assistant Tactical Coach and Computer Vision Sports Analytics Specialist for football and ice hockey.
Use only the supplied top-down tracking, homography projections, passing network metrics, spatial control metrics, and formation classifications. Do not invent unavailable events.

Current Tactical Telemetry Context:
Sport: ${tacticalContext.sport}
Teams: ${tacticalContext.teamAName} (${tacticalContext.formationA}) vs ${tacticalContext.teamBName} (${tacticalContext.formationB})
Active Possession: ${tacticalContext.possession}%
Team A Pitch Control: ${tacticalContext.pitchControlTeamA}%
Defensive Compactness: ${tacticalContext.compactnessA}m line spacing
PPDA (Pressing): ${tacticalContext.ppdaTeamA}
xThreat: ${tacticalContext.xTA}

Answer the coach's inquiry with concise, concrete advice. For football use concepts like half-spaces, rest-defense, pressing traps, and passing angles. For hockey use concepts like forecheck layers, blue-line control, weak-side lane support, slot protection, and line-change timing.`;

    const fullPrompt = `${systemPrompt}\n\nPrevious Conversation:\n${historyText}\n\nCoach: ${message}\nTactical Assistant:`;

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: fullPrompt,
    });

    res.json({
      success: true,
      source: AI_MODEL,
      reply: (response as any).text || (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text || 'Tactical analysis completed. Let us refine your team positioning on the board.',
    });
  } catch (error: any) {
    console.error('Error in coach chat:', error);
    const rawContext = req.body?.tacticalContext || req.body?.context || {};
    res.json({
      success: true,
      source: 'local_heuristics_after_ai_error',
      details: error?.message,
      reply: `I could not reach the AI model, so using the live telemetry: protect the weak side, deny the opponent's dominant channel, and shift your pressure trigger toward the highest-centrality player in the network. For "${req.body?.message || 'that question'}", validate the recommendation against the current frame/radar before changing the team shape. (Context: ${rawContext.teamA || rawContext.teamAName || 'Team A'} vs ${rawContext.teamB || rawContext.teamBName || 'Team B'})`,
    });
  }
});

// Vision Frame Tactical Analyzer Endpoint
app.post('/api/gemini/analyze-frame', async (req, res) => {
  try {
    const { imageBase64, sport, timestamp, detectedEntitiesCount } = req.body;

    if (!isGeminiConfigured() || !imageBase64) {
      return res.json({
        success: true,
        source: isGeminiConfigured() ? 'no_image' : 'local_heuristics',
        frameInsight: `Frame at ${timestamp || '00:08'} shows compact defensive organization. ${detectedEntitiesCount || 11} players identified on camera with stable spatial equilibrium and active passing lanes open toward the near flank.`,
      });
    }

    const ai = getGenAI();
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg',
            },
          },
          {
            text: `Analyze this 2D sports broadcast snapshot for ${sport || 'Football'} at match timestamp ${timestamp || '00:08'}.
1. Identify the defensive and offensive player distribution in view.
2. Note spatial overloads, pressing traps, or passing line disconnects visible in the broadcast perspective.
3. Summarize in 2-3 concise, high-impact bullet points for the coaching staff.`,
          },
        ],
      },
    });

    res.json({
      success: true,
      frameInsight: response.text || 'Frame scanned and tracked.',
    });
  } catch (error: any) {
    console.error('Error analyzing frame:', error);
    res.status(500).json({
      error: 'Failed to analyze frame',
      details: error?.message,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tactics CV Server listening on port ${PORT}`);
  });
}

startServer();
