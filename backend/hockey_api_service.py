"""
Hockey API Service - COMPLETELY SEPARATE FROM FOOTBALL
Does NOT touch backend/api_service.py football endpoints.
Uses HockeyAI_model_weight.pt (7 classes) + RinkViewTransformer
"""
import os
import sys
import json
import math
import pickle
import traceback
import hashlib
import numpy as np
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import cv2
import shutil

# Add Archive 2 to path
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
archive2_path = os.path.join(base_dir, 'Archive 2')
if archive2_path not in sys.path:
    sys.path.insert(0, archive2_path)

try:
    from trackers import HockeyTracker
    from team_assigner import TeamAssigner
    from player_ball_assigner import PlayerBallAssigner
    from camera_movement_estimator import CameraMovementEstimator
    from view_transformer import RinkViewTransformer
    from speed_and_distance_estimator import SpeedAndDistance_Estimator
    from utils import read_video, save_video
except ImportError as e:
    print(f"Hockey Import error: {e}")
    print(f"Archive 2 path: {archive2_path}")
    raise

app = FastAPI(title="Tactical Vision AI - Hockey API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths - SEPARATE FROM FOOTBALL
VIDEO_INPUT_DIR = os.path.join(base_dir, 'input_videos')
VIDEO_OUTPUT_DIR = os.path.join(base_dir, 'output_videos')
ARCHIVE2_INPUT_DIR = os.path.join(base_dir, 'Archive 2', 'input_videos')
HOCKEY_MODEL_PATH = os.path.join(base_dir, 'HockeyAI_model_weight.pt')
# Fallback if moved to Archive 2/models
ALT_HOCKEY_MODEL = os.path.join(base_dir, 'Archive 2', 'models', 'hockey.pt')
if not os.path.exists(HOCKEY_MODEL_PATH) and os.path.exists(ALT_HOCKEY_MODEL):
    HOCKEY_MODEL_PATH = ALT_HOCKEY_MODEL

HOCKEY_CACHE_DIR = os.path.join(base_dir, 'backend', 'cache_hockey')
HOCKEY_MATCH_CACHE_VERSION = "hockey-cache-v2-per-frame-rink-lines-real-stats"

# Hockey rink dimensions - Ice Hockey (IIHF/NHL avg) 61m x 30m
# Using 60x30 for IIHF standard, pitchRatio ~2.0
HOCKEY_LENGTH = 61.0
HOCKEY_WIDTH = 30.0
HOCKEY_MAX_SPEED = 42.0  # km/h for hockey (skating faster than football)

os.makedirs(VIDEO_INPUT_DIR, exist_ok=True)
os.makedirs(VIDEO_OUTPUT_DIR, exist_ok=True)
os.makedirs(HOCKEY_CACHE_DIR, exist_ok=True)


class HockeyVideoProcessRequest(BaseModel):
    video_path: str
    use_stubs: bool = False
    use_cache: bool = True
    batch_size: int = 32
    device: str = "auto"


def convert_to_python_types(obj: Any) -> Any:
    if isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8, np.uint8, np.uint16, np.uint32, np.uint64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32, np.float16)):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return float(obj)
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return [convert_to_python_types(item) for item in obj.tolist()]
    elif isinstance(obj, dict):
        return {str(k): convert_to_python_types(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [convert_to_python_types(item) for item in obj]
    else:
        return obj


def resolve_video_path(video_path: str) -> str:
    candidates = [
        video_path,
        os.path.join(base_dir, video_path),
        os.path.join(VIDEO_INPUT_DIR, os.path.basename(video_path)),
        os.path.join(ARCHIVE2_INPUT_DIR, os.path.basename(video_path)),
        os.path.join(base_dir, 'public', 'videos', os.path.basename(video_path)),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return os.path.abspath(c)
    raise FileNotFoundError(f"Video file not found at '{video_path}'. Checked candidates: {candidates}")


def get_hockey_stub_paths(resolved_path: str) -> Dict[str, str]:
    stem = os.path.splitext(os.path.basename(resolved_path))[0]
    safe_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in stem)[:120]
    stub_dir = os.path.join(base_dir, 'Archive 2', 'stubs')
    os.makedirs(stub_dir, exist_ok=True)
    return {
        "tracks": os.path.join(stub_dir, f"{safe_stem}_hockey_tracks.pkl"),
        "camera": os.path.join(stub_dir, f"{safe_stem}_hockey_camera.pkl")
    }


def get_hockey_cache_path(resolved_path: str) -> str:
    stat = os.stat(resolved_path)
    model_stat = os.stat(HOCKEY_MODEL_PATH) if os.path.exists(HOCKEY_MODEL_PATH) else None
    payload = {
        "version": HOCKEY_MATCH_CACHE_VERSION,
        "video": os.path.abspath(resolved_path),
        "videoSize": stat.st_size,
        "videoMtime": int(stat.st_mtime),
        "model": os.path.abspath(HOCKEY_MODEL_PATH),
        "modelSize": model_stat.st_size if model_stat else 0,
        "modelMtime": int(model_stat.st_mtime) if model_stat else 0,
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:24]
    stem = os.path.splitext(os.path.basename(resolved_path))[0]
    safe_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in stem)[:80]
    return os.path.join(HOCKEY_CACHE_DIR, f"{safe_stem}_{digest}_hockey.json")


def convert_bbox_to_percentage(bbox, frame_width, frame_height):
    x1, y1, x2, y2 = bbox
    return {
        "x": round(float((x1 / frame_width) * 100), 2),
        "y": round(float((y1 / frame_height) * 100), 2),
        "w": round(float(((x2 - x1) / frame_width) * 100), 2),
        "h": round(float(((y2 - y1) / frame_height) * 100), 2)
    }


def convert_position_to_percentage(position, frame_width, frame_height):
    x, y = position
    return {
        "x": round(float((x / frame_width) * 100), 2),
        "y": round(float((y / frame_height) * 100), 2)
    }


def transform_to_rink_coordinates(position_transformed, screen_pos, frame_w, frame_h):
    if position_transformed is not None and len(position_transformed) == 2:
        x, y = position_transformed
        if not math.isnan(x) and not math.isnan(y):
            return {
                "x": round(float(max(0.0, min(100.0, x))), 2),
                "y": round(float(max(0.0, min(100.0, y))), 2)
            }
    if screen_pos is not None and len(screen_pos) == 2:
        sx, sy = screen_pos
        # Hockey rink perspective: slightly different fallback
        px = 6.0 + (sx / frame_w) * 50.0
        py = 4.0 + (sy / frame_h) * 92.0
        return {
            "x": round(float(max(2.0, min(98.0, px))), 2),
            "y": round(float(max(2.0, min(98.0, py))), 2)
        }
    return {"x": 50.0, "y": 50.0}


def calculate_hockey_compactness(frames_data: List[Dict], team_key: str) -> Dict:
    snapshots = []
    for f in frames_data:
        pts = [
            e['pitchPos'] for e in f['entities']
            if e['team'] == team_key and e.get('role') != 'goalkeeper'
        ]
        if len(pts) >= 3:
            xs = [p['x'] for p in pts]
            ys = [p['y'] for p in pts]
            snapshots.append({
                "lineDepthMeters": ((max(xs) - min(xs)) / 100.0) * HOCKEY_LENGTH,
                "teamWidthMeters": ((max(ys) - min(ys)) / 100.0) * HOCKEY_WIDTH,
                "convexHullAreaSqM": ((max(xs) - min(xs)) / 100.0) * HOCKEY_LENGTH * ((max(ys) - min(ys)) / 100.0) * HOCKEY_WIDTH
            })
    if not snapshots:
        return {"lineDepthMeters": 0.0, "teamWidthMeters": 0.0, "convexHullAreaSqM": 0}
    return {
        "lineDepthMeters": round(float(np.median([s["lineDepthMeters"] for s in snapshots])), 1),
        "teamWidthMeters": round(float(np.median([s["teamWidthMeters"] for s in snapshots])), 1),
        "convexHullAreaSqM": int(round(float(np.median([s["convexHullAreaSqM"] for s in snapshots]))))
    }


def calculate_pitch_control(frames_data: List[Dict]) -> Dict[str, float]:
    frame_controls = []
    grid_x = np.linspace(3, 97, 20)
    grid_y = np.linspace(3, 97, 14)
    for f in frames_data[::max(1, len(frames_data) // 150)]:
        players_a = [e['pitchPos'] for e in f['entities'] if e['team'] == 'teamA']
        players_b = [e['pitchPos'] for e in f['entities'] if e['team'] == 'teamB']
        if not players_a or not players_b:
            continue
        controlled_a = 0
        controlled_b = 0
        for gx in grid_x:
            for gy in grid_y:
                da = min((gx - p['x']) ** 2 + (gy - p['y']) ** 2 for p in players_a)
                db = min((gx - p['x']) ** 2 + (gy - p['y']) ** 2 for p in players_b)
                if da <= db:
                    controlled_a += 1
                else:
                    controlled_b += 1
        total = controlled_a + controlled_b
        if total:
            frame_controls.append((controlled_a / total) * 100.0)
    if not frame_controls:
        return {"pitchControlA": 50.0, "pitchControlB": 50.0}
    control_a = round(float(np.mean(frame_controls)), 1)
    return {"pitchControlA": control_a, "pitchControlB": round(100.0 - control_a, 1)}


# Hockey xG / Expected Threat Grid - high near slot/crease (x 82-92), low at boards
HOCKEY_XG_GRID = [
    [0.001, 0.002, 0.003, 0.005, 0.008, 0.012, 0.018, 0.025, 0.035, 0.050, 0.070, 0.095, 0.130, 0.175, 0.230, 0.300],
    [0.001, 0.002, 0.004, 0.006, 0.010, 0.014, 0.022, 0.032, 0.045, 0.065, 0.090, 0.125, 0.170, 0.230, 0.310, 0.420],
    [0.002, 0.003, 0.006, 0.009, 0.015, 0.022, 0.035, 0.050, 0.072, 0.105, 0.145, 0.200, 0.280, 0.380, 0.520, 0.700],
    [0.002, 0.004, 0.008, 0.012, 0.020, 0.032, 0.050, 0.075, 0.110, 0.160, 0.225, 0.315, 0.435, 0.590, 0.780, 0.950],
    [0.002, 0.004, 0.008, 0.012, 0.020, 0.032, 0.050, 0.075, 0.110, 0.160, 0.225, 0.315, 0.435, 0.590, 0.780, 0.950],
    [0.002, 0.003, 0.006, 0.009, 0.015, 0.022, 0.035, 0.050, 0.072, 0.105, 0.145, 0.200, 0.280, 0.380, 0.520, 0.700],
    [0.001, 0.002, 0.004, 0.006, 0.010, 0.014, 0.022, 0.032, 0.045, 0.065, 0.090, 0.125, 0.170, 0.230, 0.310, 0.420],
    [0.001, 0.002, 0.003, 0.005, 0.008, 0.012, 0.018, 0.025, 0.035, 0.050, 0.070, 0.095, 0.130, 0.175, 0.230, 0.300]
]

def get_hockey_xt_val(pitch_pos: Dict, is_team_b: bool = False) -> float:
    cols = len(HOCKEY_XG_GRID[0])
    rows = len(HOCKEY_XG_GRID)
    col_idx = int((pitch_pos.get('x', 50) / 100.0) * cols)
    row_idx = int((pitch_pos.get('y', 50) / 100.0) * rows)
    col_idx = max(0, min(cols - 1, col_idx))
    row_idx = max(0, min(rows - 1, row_idx))
    if is_team_b:
        col_idx = cols - 1 - col_idx
    return float(HOCKEY_XG_GRID[row_idx][col_idx])


def summarize_hockey_xt(frames_data: List[Dict]) -> Dict[str, float]:
    xt = {"teamA": 0.0, "teamB": 0.0}
    previous_possession = None
    previous_pos = None
    for f in frames_data:
        team = f.get('possessionTeam')
        pid = f.get('possessionPlayerId')
        if team not in xt or not pid:
            continue
        carrier = next((e for e in f['entities'] if e['id'] == pid), None)
        if not carrier:
            continue
        pos = carrier['pitchPos']
        possession_key = (team, pid)
        if previous_possession == possession_key and previous_pos is not None:
            gained = get_hockey_xt_val(pos, is_team_b=(team == 'teamB')) - get_hockey_xt_val(previous_pos, is_team_b=(team == 'teamB'))
            xt[team] += max(0.0, gained)
        previous_possession = possession_key
        previous_pos = pos
    return {
        "expectedThreatTeamA": round(float(xt["teamA"]), 2),
        "expectedThreatTeamB": round(float(xt["teamB"]), 2)
    }


def classify_hockey_phase(entities: List[Dict], possession_team: str) -> str:
    if possession_team == 'neutral':
        return 'transitional'
    team_players = [e for e in entities if e['team'] == possession_team]
    opponents = [e for e in entities if e['team'] not in (possession_team, 'neutral')]
    if not team_players:
        return 'transitional'
    avg_x = sum(e['pitchPos']['x'] for e in team_players) / len(team_players)
    if possession_team == 'teamB':
        avg_x = 100.0 - avg_x

    # Count players in offensive zone vs defensive
    offensive_count = sum(1 for e in team_players if (e['pitchPos']['x'] if possession_team == 'teamA' else 100 - e['pitchPos']['x']) > 60)
    defensive_count = sum(1 for e in team_players if (e['pitchPos']['x'] if possession_team == 'teamA' else 100 - e['pitchPos']['x']) < 35)

    # Power play detection: more players than opponent
    if opponents and len(team_players) > len(opponents):
        return 'power_play'
    if opponents and len(team_players) < len(opponents):
        return 'penalty_kill'

    if avg_x > 65:
        return 'offensive_zone'
    if avg_x < 30:
        return 'defensive_zone'
    if opponents:
        opp_avg_x = sum(e['pitchPos']['x'] for e in opponents) / len(opponents)
        if possession_team == 'teamB':
            opp_avg_x = 100.0 - opp_avg_x
        if avg_x > 55 and opp_avg_x > 50:
            return 'forecheck'
    return 'neutral_zone'


def calculate_hockey_passing_network(frames_data: List[Dict], team_key: str):
    team_entities = {}
    player_positions = {}
    player_touches = {}
    for f in frames_data:
        for e in f['entities']:
            if e['team'] == team_key:
                pid = e['id']
                if pid not in team_entities:
                    team_entities[pid] = {
                        "id": pid,
                        "name": e['name'],
                        "jerseyNumber": e.get('jerseyNumber', 0),
                        "role": e.get('role', 'forward'),
                        "team": team_key
                    }
                    player_positions[pid] = []
                    player_touches[pid] = 0
                player_positions[pid].append(e['pitchPos'])

    previous_touch_player = None
    for f in frames_data:
        p_id = f.get('possessionPlayerId')
        p_team = f.get('possessionTeam')
        if p_id and p_team == team_key and p_id != previous_touch_player:
            player_touches[p_id] = player_touches.get(p_id, 0) + 1
            previous_touch_player = p_id
        elif p_team != team_key:
            previous_touch_player = None

    pass_events = []
    current_passer = None
    passer_pos = None
    for f in frames_data:
        p_id = f.get('possessionPlayerId')
        p_team = f.get('possessionTeam')
        if p_id and p_team == team_key:
            if current_passer is None:
                current_passer = p_id
                for ent in f['entities']:
                    if ent['id'] == p_id:
                        passer_pos = ent['pitchPos']
                        break
            elif current_passer != p_id:
                receiver_pos = None
                for ent in f['entities']:
                    if ent['id'] == p_id:
                        receiver_pos = ent['pitchPos']
                        break
                if passer_pos and receiver_pos:
                    dx = (receiver_pos['x'] - passer_pos['x']) * (HOCKEY_LENGTH / 100.0)
                    dy = (receiver_pos['y'] - passer_pos['y']) * (HOCKEY_WIDTH / 100.0)
                    dist = math.sqrt(dx * dx + dy * dy)
                    xt_start = get_hockey_xt_val(passer_pos, is_team_b=(team_key == 'teamB'))
                    xt_end = get_hockey_xt_val(receiver_pos, is_team_b=(team_key == 'teamB'))
                    xt_gained = max(-0.1, min(0.8, xt_end - xt_start))
                    pass_events.append({
                        "fromId": current_passer,
                        "toId": p_id,
                        "distance": round(dist, 1),
                        "xtGained": round(xt_gained, 3),
                        "isForward": (receiver_pos['x'] > passer_pos['x']) if team_key == 'teamA' else (receiver_pos['x'] < passer_pos['x']),
                        "destY": receiver_pos['y']
                    })
                current_passer = p_id
                passer_pos = receiver_pos
        elif p_team and p_team != team_key and p_team != 'neutral':
            current_passer = None
            passer_pos = None

    edge_map = {}
    for pe in pass_events:
        pair_key = f"{pe['fromId']}->{pe['toId']}"
        if pair_key not in edge_map:
            edge_map[pair_key] = {"fromId": pe['fromId'], "toId": pe['toId'], "count": 0, "totalDist": 0, "totalXt": 0}
        edge_map[pair_key]['count'] += 1
        edge_map[pair_key]['totalDist'] += pe['distance']
        edge_map[pair_key]['totalXt'] += pe['xtGained']

    edges = []
    for em in edge_map.values():
        edges.append({
            "fromId": em['fromId'],
            "toId": em['toId'],
            "count": em['count'],
            "successRate": 100.0,
            "avgDistanceMeters": round(em['totalDist'] / em['count'], 1),
            "xThreatGained": round(em['totalXt'], 3)
        })

    sorted_players = sorted(
        team_entities.keys(),
        key=lambda p: (len(player_positions.get(p, [])), player_touches.get(p, 0)),
        reverse=True
    )
    top_pids = set(sorted_players[:6] if len(sorted_players) > 6 else sorted_players)
    filtered_edges = [e for e in edges if e['fromId'] in top_pids and e['toId'] in top_pids]
    total_passes = sum(e['count'] for e in filtered_edges)
    nodes = []
    for pid in top_pids:
        ent = team_entities[pid]
        pos_list = player_positions.get(pid, [])
        if pos_list:
            avg_x = sum(p['x'] for p in pos_list) / len(pos_list)
            avg_y = sum(p['y'] for p in pos_list) / len(pos_list)
        else:
            avg_x, avg_y = 50.0, 50.0
        touches = player_touches.get(pid, 0)
        passes_involved = sum(e['count'] for e in filtered_edges if e['fromId'] == pid or e['toId'] == pid)
        centrality = round(min(1.0, passes_involved / max(1, total_passes * 2)), 2)
        nodes.append({
            "id": pid,
            "name": ent['name'],
            "jerseyNumber": ent['jerseyNumber'],
            "avgPitchPos": {"x": round(avg_x, 1), "y": round(avg_y, 1)},
            "touches": touches,
            "centrality": centrality,
            "role": ent['role'],
            "team": team_key
        })

    channel_counts = {"Left Wing": 0, "Left Half-Space": 0, "Center": 0, "Right Half-Space": 0, "Right Wing": 0}
    for pe in pass_events:
        y = pe['destY']
        if y < 20:
            channel_counts["Left Wing"] += 1
        elif y < 40:
            channel_counts["Left Half-Space"] += 1
        elif y <= 60:
            channel_counts["Center"] += 1
        elif y <= 80:
            channel_counts["Right Half-Space"] += 1
        else:
            channel_counts["Right Wing"] += 1

    dominant_channel = max(channel_counts, key=channel_counts.get) if pass_events else "Center"
    forward_passes = sum(1 for pe in pass_events if pe['isForward'])
    directness_index = round((forward_passes / len(pass_events) * 100), 1) if pass_events else 0.0
    pass_accuracy = 100.0 if edges else 0.0

    return {
        "nodes": nodes,
        "edges": filtered_edges,
        "dominantChannnel": dominant_channel,
        "dominantChannel": dominant_channel,
        "passAccuracy": pass_accuracy,
        "directnessIndex": directness_index
    }


def detect_hockey_formation_from_nodes(nodes: List[Dict], is_team_b: bool = False) -> str:
    outfield = [n for n in nodes if n.get('role') != 'goalkeeper']
    if len(outfield) < 4:
        return "1-3-1 Power Play"
    if len(outfield) <= 5:
        return "1-3-1 Power Play"
    # 6 skaters typical
    sorted_nodes = sorted(outfield, key=lambda n: n['avgPitchPos']['x'], reverse=is_team_b)
    min_x = sorted_nodes[0]['avgPitchPos']['x']
    max_x = sorted_nodes[-1]['avgPitchPos']['x']
    span = max(1.0, max_x - min_x)
    defenders, midfielders, forwards = 0, 0, 0
    for n in sorted_nodes:
        rel = (n['avgPitchPos']['x'] - min_x) / span if not is_team_b else (max_x - n['avgPitchPos']['x']) / span
        if rel < 0.35:
            defenders += 1
        elif rel < 0.70:
            midfielders += 1
        else:
            forwards += 1
    # Hockey formations
    if defenders == 1 and midfielders == 3 and forwards == 2:
        return "1-3-2"
    if defenders == 2 and midfielders == 2 and forwards == 2:
        return "2-2-2"
    if defenders == 2 and midfielders == 1 and forwards == 3:
        return "2-1-3 Aggressive"
    if defenders == 1 and midfielders == 2 and forwards == 3:
        return "1-2-3"
    if defenders == 2 and midfielders == 3 and forwards == 1:
        return "2-3-1 Trap"
    return f"{defenders}-{midfielders}-{forwards}"


def process_hockey_video_to_match_data(video_path: str, use_stubs: bool = False, use_cache: bool = True, batch_size: int = 32, device: str = "auto") -> Dict:
    resolved_path = resolve_video_path(video_path)
    print(f"[HOCKEY] Processing video from: {resolved_path}")
    print(f"[HOCKEY] Using model: {HOCKEY_MODEL_PATH} exists={os.path.exists(HOCKEY_MODEL_PATH)}")
    stub_paths = get_hockey_stub_paths(resolved_path)
    cache_path = get_hockey_cache_path(resolved_path)

    if use_cache and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            cached = json.load(f)
        cached["cache"] = {"hit": True, "path": cache_path}
        print(f"[HOCKEY] Cache hit: {cache_path}")
        return cached

    video_frames = read_video(resolved_path)
    if not video_frames or len(video_frames) == 0:
        raise ValueError(f"Could not read any video frames from {resolved_path}")

    cap_meta = cv2.VideoCapture(resolved_path)
    fps_val = cap_meta.get(cv2.CAP_PROP_FPS)
    cap_meta.release()
    fps = float(fps_val) if fps_val and fps_val > 5 else 25.0
    frame_height, frame_width = video_frames[0].shape[:2]
    print(f"[HOCKEY] Video: {len(video_frames)} frames, {frame_width}x{frame_height} @ {fps}fps")

    tracker = HockeyTracker(HOCKEY_MODEL_PATH, batch_size=batch_size, device=device)

    tracks = tracker.get_object_tracks(
        video_frames,
        read_from_stub=use_stubs,
        stub_path=stub_paths["tracks"]
    )
    landmarks = tracker.landmarks_per_frame if hasattr(tracker, 'landmarks_per_frame') else []
    print(f"[HOCKEY] Tracks: {len(tracks['players'])} frames, landmarks collected: {len(landmarks)}")

    tracker.add_position_to_tracks(tracks)

    camera_movement_estimator = CameraMovementEstimator(video_frames[0])
    camera_movement_per_frame = camera_movement_estimator.get_camera_movement(
        video_frames,
        read_from_stub=use_stubs,
        stub_path=stub_paths["camera"]
    )
    camera_movement_estimator.add_adjust_positions_to_tracks(tracks, camera_movement_per_frame)

    # Use per-frame rink calibration; the camera pans too much for a single hockey homography.
    view_transformer = RinkViewTransformer(video_frames[0], landmarks_per_frame=landmarks, video_frames=video_frames)
    view_transformer.add_transformed_position_to_tracks(tracks)

    # Interpolate puck
    tracks["puck"] = tracker.interpolate_puck_positions(tracks["puck"])
    tracker.add_position_to_tracks({"puck": tracks["puck"]})
    view_transformer.add_transformed_position_to_tracks({"puck": tracks["puck"]})

    speed_and_distance_estimator = SpeedAndDistance_Estimator(
        frame_rate=fps,
        pitch_length_meters=HOCKEY_LENGTH,
        pitch_width_meters=HOCKEY_WIDTH
    )
    # Update max speed for hockey
    speed_and_distance_estimator.max_player_speed_kmh = HOCKEY_MAX_SPEED
    speed_and_distance_estimator.add_speed_and_distance_to_tracks(tracks)

    team_assigner = TeamAssigner()
    if tracks['players'] and len(tracks['players']) > 0 and tracks['players'][0]:
        team_assigner.assign_team_color(video_frames[0], tracks['players'][0])
    else:
        team_assigner.team_colors = {1: np.array([230, 230, 230]), 2: np.array([180, 20, 20])}

    for frame_num, player_track in enumerate(tracks['players']):
        for player_id, track in player_track.items():
            team = team_assigner.get_player_team(
                video_frames[frame_num],
                track['bbox'],
                player_id
            )
            tracks['players'][frame_num][player_id]['team'] = team
            tracks['players'][frame_num][player_id]['team_color'] = team_assigner.team_colors.get(team, [0, 0, 255])

    player_assigner = PlayerBallAssigner()
    # Hockey puck assignment - slightly smaller threshold
    player_assigner.max_player_ball_distance = 60.0
    team_puck_control = []
    for frame_num, player_track in enumerate(tracks['players']):
        puck_bbox = tracks['puck'][frame_num].get(1, {}).get('bbox')
        if puck_bbox is None:
            team_puck_control.append(0)
            continue
        assigned_player = player_assigner.assign_ball_to_player(player_track, puck_bbox)
        if assigned_player != -1:
            tracks['players'][frame_num][assigned_player]['has_puck'] = True
            tracks['players'][frame_num][assigned_player]['has_ball'] = True
            team_puck_control.append(tracks['players'][frame_num][assigned_player]['team'])
        else:
            team_puck_control.append(0)

    # Player roles for hockey: goalie + defensemen + forwards
    player_all_pitch_x = {}
    player_teams = {}
    for frame_num in range(len(video_frames)):
        for player_id, player_data in tracks['players'][frame_num].items():
            tid = player_data.get('team', 1)
            player_teams[player_id] = tid
            pos_t = player_data.get('position_transformed')
            pos_scr = player_data.get('position', [0, 0])
            pitch_pos = transform_to_rink_coordinates(pos_t, pos_scr, frame_width, frame_height)
            if player_id not in player_all_pitch_x:
                player_all_pitch_x[player_id] = []
            player_all_pitch_x[player_id].append(pitch_pos['x'])

    player_roles = {}
    for team_id in [1, 2]:
        t_players = [pid for pid, tid in player_teams.items() if tid == team_id]
        if not t_players:
            continue
        avg_xs = {pid: (sum(player_all_pitch_x[pid]) / len(player_all_pitch_x[pid])) for pid in t_players if pid in player_all_pitch_x}
        # Check for goalie flag
        goalie_candidates = [pid for pid in t_players if any(tracks['players'][f].get(pid, {}).get('is_goalie', False) for f in range(len(video_frames)) if pid in tracks['players'][f])]
        sorted_p = sorted(avg_xs.keys(), key=lambda p: avg_xs[p], reverse=(team_id == 2))
        if goalie_candidates:
            # Most defensive among goalie candidates is goalie
            goalie_id = min(goalie_candidates, key=lambda p: avg_xs[p] if team_id == 1 else -avg_xs[p])
            player_roles[goalie_id] = 'goalkeeper'
            remaining = [p for p in sorted_p if p != goalie_id]
        else:
            if sorted_p:
                player_roles[sorted_p[0]] = 'goalkeeper'
            remaining = sorted_p[1:]
        for idx, pid in enumerate(remaining):
            ratio = (idx + 1) / max(1, len(remaining))
            if ratio <= 0.35:
                player_roles[pid] = 'defender'
            elif ratio <= 0.75:
                player_roles[pid] = 'midfielder'
            else:
                player_roles[pid] = 'forward'

    frames_data = []
    prev_player_positions = {}
    prev_possession_player_id = None
    prev_possession_team_name = 'neutral'

    for frame_num in range(len(video_frames)):
        time_sec = frame_num / fps
        min_str = int(time_sec // 60)
        sec_str = int(time_sec % 60)
        time_display = f"{str(min_str).zfill(2)}:{str(sec_str).zfill(2)}"
        entities = []
        for player_id, player_data in tracks['players'][frame_num].items():
            team_id = player_data.get('team', 1)
            team_name = 'teamA' if team_id == 1 else 'teamB'
            role = player_roles.get(player_id, 'forward')
            bbox_pct = convert_bbox_to_percentage(player_data['bbox'], frame_width, frame_height)
            screen_pos_pct = convert_position_to_percentage(player_data.get('position', [0, 0]), frame_width, frame_height)
            pitch_pos_pct = transform_to_rink_coordinates(
                player_data.get('position_transformed'),
                player_data.get('position', [0, 0]),
                frame_width,
                frame_height
            )
            prev_pos = prev_player_positions.get(player_id, pitch_pos_pct)
            vx = round((pitch_pos_pct['x'] - prev_pos['x']), 2)
            vy = round((pitch_pos_pct['y'] - prev_pos['y']), 2)
            prev_player_positions[player_id] = pitch_pos_pct
            speed_val = player_data.get('speed', 0.0)
            if not isinstance(speed_val, (int, float)) or math.isnan(speed_val):
                speed_val = 0.0
            dist_val = player_data.get('distance', 0.0)
            if not isinstance(dist_val, (int, float)) or math.isnan(dist_val):
                dist_val = 0.0
            # Check if is goalie
            is_goalie = player_data.get('is_goalie', False) or role == 'goalkeeper'
            display_role = 'goalkeeper' if is_goalie else role
            entity = {
                "id": f"{team_name}_{player_id}",
                "name": f"Player {player_id}" + (" (G)" if is_goalie else ""),
                "jerseyNumber": int(player_id) % 99,
                "team": team_name,
                "role": display_role,
                "confidence": 0.94,
                "bbox": bbox_pct,
                "screenPos": screen_pos_pct,
                "pitchPos": pitch_pos_pct,
                "velocity": {"x": vx, "y": vy},
                "speedKmh": round(float(speed_val), 1),
                "distanceCoveredMeters": round(float(dist_val), 1),
                "hasPossession": bool(player_data.get('has_puck', False) or player_data.get('has_ball', False))
            }
            entities.append(entity)

        puck_pitch_pos = None
        puck_screen_pos = None
        if tracks['puck'] and frame_num < len(tracks['puck']) and tracks['puck'][frame_num].get(1):
            puck_data = tracks['puck'][frame_num][1]
            bb = puck_data.get('bbox', [])
            if len(bb) == 4 and (bb[2] - bb[0] > 1) and (bb[3] - bb[1] > 1):
                center_x = (bb[0] + bb[2]) / 2.0
                center_y = (bb[1] + bb[3]) / 2.0
                puck_screen_pos = convert_position_to_percentage([center_x, center_y], frame_width, frame_height)
                puck_pitch_pos = transform_to_rink_coordinates(
                    puck_data.get('position_transformed'),
                    [center_x, center_y],
                    frame_width,
                    frame_height
                )

        current_possession_team = team_puck_control[frame_num] if frame_num < len(team_puck_control) else 0
        possession_team_name = 'teamA' if current_possession_team == 1 else 'teamB' if current_possession_team == 2 else 'neutral'
        possession_player_id = None
        for entity in entities:
            if entity.get('hasPossession'):
                possession_player_id = entity['id']
                break
        homography_calibration = view_transformer.get_calibration_percentages(frame_num)
        phase = classify_hockey_phase(entities, possession_team_name)
        event_tag = None
        if (
            possession_player_id
            and prev_possession_player_id
            and possession_team_name == prev_possession_team_name
            and possession_player_id != prev_possession_player_id
        ):
            event_tag = "Hockey puck transfer"

        frame_data = {
            "frameIndex": frame_num,
            "timestampSec": round(float(time_sec), 2),
            "timeDisplay": time_display,
            "entities": entities,
            "ballPos": puck_pitch_pos,
            "ballScreenPos": puck_screen_pos,
            "puckPos": puck_pitch_pos,
            "puckScreenPos": puck_screen_pos,
            "possessionTeam": possession_team_name,
            "possessionPlayerId": possession_player_id,
            "phase": phase,
            "eventTag": event_tag,
            "homographyCalibration": homography_calibration
        }
        frames_data.append(frame_data)
        prev_possession_player_id = possession_player_id or prev_possession_player_id
        prev_possession_team_name = possession_team_name if possession_player_id else prev_possession_team_name

    passing_network_a = calculate_hockey_passing_network(frames_data, 'teamA')
    passing_network_b = calculate_hockey_passing_network(frames_data, 'teamB')
    formation_a = detect_hockey_formation_from_nodes(passing_network_a['nodes'], is_team_b=False)
    formation_b = detect_hockey_formation_from_nodes(passing_network_b['nodes'], is_team_b=True)
    team_a_frames = sum(1 for f in team_puck_control if f == 1)
    team_b_frames = sum(1 for f in team_puck_control if f == 2)
    total_controlled = team_a_frames + team_b_frames or 1
    possession_pct = round((team_a_frames / total_controlled) * 100, 1)
    total_passes_a = sum(e['count'] for e in passing_network_a['edges'])
    total_passes_b = sum(e['count'] for e in passing_network_b['edges'])
    total_passes = total_passes_a + total_passes_b
    pitch_control = calculate_pitch_control(frames_data)
    compactness_a = calculate_hockey_compactness(frames_data, 'teamA')
    compactness_b = calculate_hockey_compactness(frames_data, 'teamB')
    xt_summary = summarize_hockey_xt(frames_data)
    defensive_transitions = 0
    previous_team = 'neutral'
    for f in frames_data:
        current_team = f.get('possessionTeam', 'neutral')
        if current_team in ('teamA', 'teamB') and previous_team in ('teamA', 'teamB') and current_team != previous_team:
            defensive_transitions += 1
        if current_team in ('teamA', 'teamB'):
            previous_team = current_team
    key_recoveries = sum(1 for f in frames_data if f.get('eventTag') == 'Hockey puck transfer')

    base_metrics = {
        "possession": possession_pct,
        "possessionA": possession_pct,
        "possessionB": round(100.0 - possession_pct, 1),
        "pitchControlA": pitch_control["pitchControlA"],
        "pitchControlB": pitch_control["pitchControlB"],
        "shotsOnTarget": 0,
        "shotsTotal": 0,
        "passesCompleted": total_passes,
        "passAccuracy": 100.0 if total_passes > 0 else 0.0,
        "detectedFormationA": formation_a,
        "detectedFormationB": formation_b,
        "ppdaTeamA": round(total_passes_b / max(1, defensive_transitions), 1),
        "ppdaTeamB": round(total_passes_a / max(1, defensive_transitions), 1),
        "compactnessA": compactness_a,
        "compactnessB": compactness_b,
        "expectedThreatTeamA": xt_summary["expectedThreatTeamA"],
        "expectedThreatTeamB": xt_summary["expectedThreatTeamB"],
        "defensiveTransitionsCount": defensive_transitions,
        "keyRecoveryZonesCount": key_recoveries
    }

    def rgb_to_hex(rgb):
        if rgb is None or len(rgb) < 3:
            return "#60a5fa"
        return "#{:02x}{:02x}{:02x}".format(int(rgb[0]), int(rgb[1]), int(rgb[2]))

    team_a_color = rgb_to_hex(team_assigner.team_colors.get(1, [230, 230, 230]))
    team_b_color = rgb_to_hex(team_assigner.team_colors.get(2, [180, 20, 20]))

    dimension = {
        "name": "Standard Ice Hockey Rink (IIHF 60x30m)",
        "lengthMeters": HOCKEY_LENGTH,
        "widthMeters": HOCKEY_WIDTH,
        "pitchRatio": round(HOCKEY_LENGTH / HOCKEY_WIDTH, 3),
        "surfaceTheme": "ice",
        "landmarks": [
            {"name": "Center Ice", "pitchPos": {"x": 50, "y": 50}},
            {"name": "Goal Line Team A", "pitchPos": {"x": 8, "y": 50}},
            {"name": "Goal Line Team B", "pitchPos": {"x": 92, "y": 50}},
            {"name": "Blue Line Left", "pitchPos": {"x": 33, "y": 50}},
            {"name": "Blue Line Right", "pitchPos": {"x": 67, "y": 50}},
            {"name": "Faceoff Dot TL", "pitchPos": {"x": 20, "y": 30}},
            {"name": "Faceoff Dot TR", "pitchPos": {"x": 80, "y": 30}},
            {"name": "Faceoff Dot BL", "pitchPos": {"x": 20, "y": 70}},
            {"name": "Faceoff Dot BR", "pitchPos": {"x": 80, "y": 70}}
        ]
    }

    result = {
        "id": "hockey-match-real",
        "name": f"Hockey Rink Analysis: {os.path.basename(resolved_path)}",
        "sport": "hockey",
        "description": "Automated Hockey Vision tracking with YOLOv8 7-Class, Rink Homography, and Ice Analytics",
        "durationSec": round(len(frames_data) / fps, 1),
        "fps": fps,
        "frames": frames_data,
        "teamA": {
            "id": "teamA",
            "name": "Team White / Light",
            "shortName": "TMA",
            "primaryColor": team_a_color,
            "secondaryColor": "#1e40af",
            "textColor": "#ffffff",
            "formation": formation_a,
            "sport": "hockey"
        },
        "teamB": {
            "id": "teamB",
            "name": "Team Red / Dark",
            "shortName": "TMB",
            "primaryColor": team_b_color,
            "secondaryColor": "#991b1b",
            "textColor": "#ffffff",
            "formation": formation_b,
            "sport": "hockey"
        },
        "passingNetworkA": passing_network_a,
        "passingNetworkB": passing_network_b,
        "baseMetrics": base_metrics,
        "dimension": dimension,
        "videoPlaceholderTheme": "ice"
    }

    result = convert_to_python_types(result)
    if use_cache:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f)
        result["cache"] = {"hit": False, "path": cache_path}

    return result


# === NEW HOCKEY API ENDPOINTS - SEPARATE FROM FOOTBALL ===

@app.post("/api/hockey/process-video")
async def hockey_process_video(request: HockeyVideoProcessRequest):
    """Hockey: Process a hockey video file and return tactical analysis"""
    try:
        match_data = process_hockey_video_to_match_data(
            video_path=request.video_path,
            use_stubs=request.use_stubs,
            use_cache=request.use_cache,
            batch_size=request.batch_size,
            device=request.device
        )
        return JSONResponse(content=match_data)
    except FileNotFoundError as e:
        traceback.print_exc()
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing hockey video: {str(e)}")


@app.post("/api/hockey/upload-video")
async def hockey_upload_video(file: UploadFile = File(...)):
    """Hockey: Upload a hockey video file"""
    try:
        file_extension = os.path.splitext(file.filename)[1] or ".mp4"
        clean_filename = f"hockey_upload_{os.path.splitext(file.filename)[0].replace(' ', '_')}{file_extension}"
        file_path = os.path.join(VIDEO_INPUT_DIR, clean_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        public_dest = os.path.join(base_dir, 'public', 'videos', clean_filename)
        os.makedirs(os.path.dirname(public_dest), exist_ok=True)
        shutil.copyfile(file_path, public_dest)
        return {
            "success": True,
            "video_path": file_path,
            "filename": clean_filename,
            "public_url": f"/videos/{clean_filename}"
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error uploading hockey video: {str(e)}")


@app.get("/api/hockey/videos")
async def hockey_list_videos():
    """Hockey: List available hockey video files (filtered)"""
    try:
        videos = []
        seen = set()
        for input_dir in [VIDEO_INPUT_DIR, ARCHIVE2_INPUT_DIR]:
            if os.path.exists(input_dir):
                for filename in os.listdir(input_dir):
                    if filename.endswith(('.mp4', '.avi', '.mov', '.mkv')) and not filename.startswith('.'):
                        # Include all but mark hockey ones
                        if filename not in seen:
                            seen.add(filename)
                            file_path = os.path.join(input_dir, filename)
                            is_hockey = "hockey" in filename.lower() or "ice" in filename.lower()
                            videos.append({
                                "filename": filename,
                                "path": file_path,
                                "size": os.path.getsize(file_path),
                                "public_url": f"/videos/{filename}" if os.path.exists(os.path.join(base_dir, 'public', 'videos', filename)) else f"/videos/archive/{filename}",
                                "is_hockey": is_hockey
                            })
        return {"videos": videos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing hockey videos: {str(e)}")


@app.get("/api/hockey/health")
async def hockey_health_check():
    """Hockey: Health check"""
    return {
        "status": "healthy",
        "sport": "hockey",
        "model_exists": os.path.exists(HOCKEY_MODEL_PATH),
        "model_path": HOCKEY_MODEL_PATH,
        "input_dir_exists": os.path.exists(VIDEO_INPUT_DIR),
        "output_dir_exists": os.path.exists(VIDEO_OUTPUT_DIR),
        "rink_dimensions": f"{HOCKEY_LENGTH}x{HOCKEY_WIDTH}m",
        "cache_dir_exists": os.path.exists(HOCKEY_CACHE_DIR)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
