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

# Add Archive 2 to path to import modules
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
archive2_path = os.path.join(base_dir, 'Archive 2')
if archive2_path not in sys.path:
    sys.path.insert(0, archive2_path)

try:
    from trackers import Tracker
    from team_assigner import TeamAssigner
    from player_ball_assigner import PlayerBallAssigner
    from camera_movement_estimator import CameraMovementEstimator
    from view_transformer import ViewTransformer
    from speed_and_distance_estimator import SpeedAndDistance_Estimator
    from utils import read_video, save_video
except ImportError as e:
    print(f"Import error: {e}")
    print(f"Archive 2 path: {archive2_path}")
    print(f"Python path: {sys.path}")
    raise

app = FastAPI(title="Tactical Vision AI API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
VIDEO_INPUT_DIR = os.path.join(base_dir, 'input_videos')
VIDEO_OUTPUT_DIR = os.path.join(base_dir, 'output_videos')
ARCHIVE2_INPUT_DIR = os.path.join(base_dir, 'Archive 2', 'input_videos')
MODEL_PATH = os.path.join(base_dir, 'Archive 2', 'models', 'best.pt')
TRACK_STUB_PATH = os.path.join(base_dir, 'Archive 2', 'stubs', 'track_stubs.pkl')
CAMERA_STUB_PATH = os.path.join(base_dir, 'Archive 2', 'stubs', 'camera_movement_stub.pkl')
MATCH_CACHE_DIR = os.path.join(base_dir, 'backend', 'cache')
MATCH_CACHE_VERSION = "match-cache-v3-visible-pitch-window"

# Ensure directories exist
os.makedirs(VIDEO_INPUT_DIR, exist_ok=True)
os.makedirs(VIDEO_OUTPUT_DIR, exist_ok=True)
os.makedirs(os.path.dirname(TRACK_STUB_PATH), exist_ok=True)
os.makedirs(MATCH_CACHE_DIR, exist_ok=True)


class VideoProcessRequest(BaseModel):
    video_path: str
    use_stubs: bool = False
    use_cache: bool = True
    batch_size: int = 32
    device: str = "auto"


def convert_to_python_types(obj: Any) -> Any:
    """Convert numpy and non-standard types to native Python types for clean JSON serialization"""
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
    """Resolve video path checking multiple plausible directories"""
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


def get_video_stub_paths(resolved_path: str) -> Dict[str, str]:
    stem = os.path.splitext(os.path.basename(resolved_path))[0]
    safe_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in stem)[:120]
    stub_dir = os.path.join(base_dir, 'Archive 2', 'stubs')
    return {
        "tracks": os.path.join(stub_dir, f"{safe_stem}_tracks.pkl"),
        "camera": os.path.join(stub_dir, f"{safe_stem}_camera.pkl")
    }


def get_match_cache_path(resolved_path: str) -> str:
    stat = os.stat(resolved_path)
    model_stat = os.stat(MODEL_PATH) if os.path.exists(MODEL_PATH) else None
    payload = {
        "version": MATCH_CACHE_VERSION,
        "video": os.path.abspath(resolved_path),
        "videoSize": stat.st_size,
        "videoMtime": int(stat.st_mtime),
        "model": os.path.abspath(MODEL_PATH),
        "modelSize": model_stat.st_size if model_stat else 0,
        "modelMtime": int(model_stat.st_mtime) if model_stat else 0,
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:24]
    stem = os.path.splitext(os.path.basename(resolved_path))[0]
    safe_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in stem)[:80]
    return os.path.join(MATCH_CACHE_DIR, f"{safe_stem}_{digest}.json")


def convert_bbox_to_percentage(bbox, frame_width, frame_height):
    """Convert pixel bbox [x1, y1, x2, y2] to percentage coordinates [x, y, w, h]"""
    x1, y1, x2, y2 = bbox
    return {
        "x": round(float((x1 / frame_width) * 100), 2),
        "y": round(float((y1 / frame_height) * 100), 2),
        "w": round(float(((x2 - x1) / frame_width) * 100), 2),
        "h": round(float(((y2 - y1) / frame_height) * 100), 2)
    }


def convert_position_to_percentage(position, frame_width, frame_height):
    """Convert pixel position to percentage coordinates"""
    x, y = position
    return {
        "x": round(float((x / frame_width) * 100), 2),
        "y": round(float((y / frame_height) * 100), 2)
    }


def transform_to_pitch_coordinates(position_transformed, screen_pos, frame_w, frame_h):
    """Transform court coordinates to pitch percentage (0-100)"""
    if position_transformed is not None and len(position_transformed) == 2:
        x, y = position_transformed
        if not math.isnan(x) and not math.isnan(y):
            return {
                "x": round(float(max(0.0, min(100.0, x))), 2),
                "y": round(float(max(0.0, min(100.0, y))), 2)
            }
    
    # Fallback to perspective screen projection
    if screen_pos is not None and len(screen_pos) == 2:
        sx, sy = screen_pos
        px = 8.0 + (sx / frame_w) * 45.0
        py = 5.0 + (sy / frame_h) * 90.0
        return {
            "x": round(float(max(4.0, min(96.0, px))), 2),
            "y": round(float(max(4.0, min(96.0, py))), 2)
        }
    return {"x": 25.0, "y": 50.0}


def calculate_compactness(frames_data: List[Dict], team_key: str, length_m: float = 105.0, width_m: float = 68.0) -> Dict:
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
                "lineDepthMeters": ((max(xs) - min(xs)) / 100.0) * length_m,
                "teamWidthMeters": ((max(ys) - min(ys)) / 100.0) * width_m,
                "convexHullAreaSqM": ((max(xs) - min(xs)) / 100.0) * length_m * ((max(ys) - min(ys)) / 100.0) * width_m
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


def summarize_xt(frames_data: List[Dict]) -> Dict[str, float]:
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
            gained = get_xt_val(pos, is_team_b=(team == 'teamB')) - get_xt_val(previous_pos, is_team_b=(team == 'teamB'))
            xt[team] += max(0.0, gained)

        previous_possession = possession_key
        previous_pos = pos

    return {
        "expectedThreatTeamA": round(float(xt["teamA"]), 2),
        "expectedThreatTeamB": round(float(xt["teamB"]), 2)
    }


def classify_phase(entities: List[Dict], possession_team: str) -> str:
    if possession_team == 'neutral':
        return 'transitional'

    team_players = [e for e in entities if e['team'] == possession_team]
    opponents = [e for e in entities if e['team'] not in (possession_team, 'neutral')]
    if not team_players:
        return 'transitional'

    avg_x = sum(e['pitchPos']['x'] for e in team_players) / len(team_players)
    if possession_team == 'teamB':
        avg_x = 100.0 - avg_x

    if opponents:
        opp_avg_x = sum(e['pitchPos']['x'] for e in opponents) / len(opponents)
        if possession_team == 'teamB':
            opp_avg_x = 100.0 - opp_avg_x
        if avg_x > 58 and opp_avg_x > 50:
            return 'high_press'

    if avg_x > 67:
        return 'counter_attack'
    if avg_x < 40:
        return 'build_up'
    return 'transitional'


# Expected Threat (xT) Grid (16x12)
XT_GRID = [
    [0.001, 0.002, 0.003, 0.005, 0.008, 0.012, 0.018, 0.027, 0.039, 0.056, 0.078, 0.115, 0.162, 0.220, 0.310, 0.450],
    [0.001, 0.002, 0.004, 0.006, 0.010, 0.015, 0.022, 0.033, 0.048, 0.068, 0.098, 0.142, 0.201, 0.285, 0.395, 0.580],
    [0.001, 0.003, 0.005, 0.008, 0.012, 0.018, 0.028, 0.042, 0.062, 0.089, 0.128, 0.185, 0.265, 0.370, 0.510, 0.760],
    [0.002, 0.003, 0.006, 0.009, 0.015, 0.023, 0.035, 0.052, 0.078, 0.112, 0.162, 0.235, 0.340, 0.485, 0.680, 0.940],
    [0.002, 0.003, 0.006, 0.009, 0.015, 0.023, 0.035, 0.052, 0.078, 0.112, 0.162, 0.235, 0.340, 0.485, 0.680, 0.940],
    [0.001, 0.003, 0.005, 0.008, 0.012, 0.018, 0.028, 0.042, 0.062, 0.089, 0.128, 0.185, 0.265, 0.370, 0.510, 0.760],
    [0.001, 0.002, 0.004, 0.006, 0.010, 0.015, 0.022, 0.033, 0.048, 0.068, 0.098, 0.142, 0.201, 0.285, 0.395, 0.580],
    [0.001, 0.002, 0.003, 0.005, 0.008, 0.012, 0.018, 0.027, 0.039, 0.056, 0.078, 0.115, 0.162, 0.220, 0.310, 0.450]
]

def get_xt_val(pitch_pos: Dict, is_team_b: bool = False) -> float:
    cols = len(XT_GRID[0])
    rows = len(XT_GRID)
    col_idx = int((pitch_pos.get('x', 50) / 100.0) * cols)
    row_idx = int((pitch_pos.get('y', 50) / 100.0) * rows)
    col_idx = max(0, min(cols - 1, col_idx))
    row_idx = max(0, min(rows - 1, row_idx))
    if is_team_b:
        col_idx = cols - 1 - col_idx
    return float(XT_GRID[row_idx][col_idx])


def calculate_real_passing_network(frames_data: List[Dict], team_key: str):
    """
    Extract real passing network from frame possession transitions
    """
    team_entities = {}
    player_positions = {}
    player_touches = {}
    
    # 1. Collect all players in team and their positions across match
    for f in frames_data:
        for e in f['entities']:
            if e['team'] == team_key:
                pid = e['id']
                if pid not in team_entities:
                    team_entities[pid] = {
                        "id": pid,
                        "name": e['name'],
                        "jerseyNumber": e.get('jerseyNumber', 0),
                        "role": e.get('role', 'midfielder'),
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

    # 2. Detect passes between players
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
                # Possession transferred to a different teammate!
                receiver_pos = None
                for ent in f['entities']:
                    if ent['id'] == p_id:
                        receiver_pos = ent['pitchPos']
                        break
                
                if passer_pos and receiver_pos:
                    dx = (receiver_pos['x'] - passer_pos['x']) * 1.05
                    dy = (receiver_pos['y'] - passer_pos['y']) * 0.68
                    dist = math.sqrt(dx * dx + dy * dy)
                    
                    xt_start = get_xt_val(passer_pos, is_team_b=(team_key == 'teamB'))
                    xt_end = get_xt_val(receiver_pos, is_team_b=(team_key == 'teamB'))
                    xt_gained = max(-0.1, min(0.5, xt_end - xt_start))
                    
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

    # 3. Aggregate pass edges
    edge_map = {}
    for pe in pass_events:
        pair_key = f"{pe['fromId']}->{pe['toId']}"
        if pair_key not in edge_map:
            edge_map[pair_key] = {
                "fromId": pe['fromId'],
                "toId": pe['toId'],
                "count": 0,
                "totalDist": 0,
                "totalXt": 0
            }
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

    # Filter to top active players for clean passing network
    sorted_players = sorted(
        team_entities.keys(),
        key=lambda p: (len(player_positions.get(p, [])), player_touches.get(p, 0)),
        reverse=True
    )
    top_pids = set(sorted_players[:14] if len(sorted_players) > 14 else sorted_players)
    
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

    # 5. Dominant channel calculation
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


def detect_team_formation_from_nodes(nodes: List[Dict], is_team_b: bool = False) -> str:
    """Detect tactical formation from average node pitch positions"""
    outfield = [n for n in nodes if n.get('role') != 'goalkeeper']
    if len(outfield) < 6:
        return "4-3-3"
    
    sorted_nodes = sorted(outfield, key=lambda n: n['avgPitchPos']['x'], reverse=is_team_b)
    min_x = sorted_nodes[0]['avgPitchPos']['x']
    max_x = sorted_nodes[-1]['avgPitchPos']['x']
    span = max(1.0, max_x - min_x)
    
    defenders, midfielders, forwards = 0, 0, 0
    for n in sorted_nodes:
        rel = (n['avgPitchPos']['x'] - min_x) / span if not is_team_b else (max_x - n['avgPitchPos']['x']) / span
        if rel < 0.35:
            defenders += 1
        elif rel < 0.72:
            midfielders += 1
        else:
            forwards += 1

    if defenders == 4 and midfielders == 3 and forwards == 3:
        return "4-3-3"
    elif defenders == 4 and midfielders == 4 and forwards == 2:
        return "4-4-2"
    elif defenders == 3 and midfielders == 5 and forwards == 2:
        return "3-5-2"
    elif defenders == 4 and midfielders == 2 and forwards == 4:
        return "4-2-3-1"
    elif defenders == 5 and midfielders == 3 and forwards == 2:
        return "5-3-2"
    
    return f"{max(3, min(5, defenders))}-{max(2, min(5, midfielders))}-{max(1, min(4, forwards))}"


def process_video_to_match_data(video_path: str, use_stubs: bool = False, use_cache: bool = True, batch_size: int = 32, device: str = "auto") -> Dict:
    """Process video and convert to match data format compatible with UI"""
    
    resolved_path = resolve_video_path(video_path)
    print(f"Processing video from: {resolved_path}")
    stub_paths = get_video_stub_paths(resolved_path)
    cache_path = get_match_cache_path(resolved_path)

    if use_cache and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            cached = json.load(f)
        cached["cache"] = {"hit": True, "path": cache_path}
        return cached
    
    video_frames = read_video(resolved_path)
    if not video_frames or len(video_frames) == 0:
        raise ValueError(f"Could not read any video frames from {resolved_path}")
    
    cap_meta = cv2.VideoCapture(resolved_path)
    fps_val = cap_meta.get(cv2.CAP_PROP_FPS)
    cap_meta.release()
    fps = float(fps_val) if fps_val and fps_val > 5 else 25.0
    frame_height, frame_width = video_frames[0].shape[:2]
    
    tracker = Tracker(MODEL_PATH, batch_size=batch_size, device=device)
    
    tracks = tracker.get_object_tracks(
        video_frames,
        read_from_stub=use_stubs,
        stub_path=stub_paths["tracks"]
    )
    
    tracker.add_position_to_tracks(tracks)
    
    camera_movement_estimator = CameraMovementEstimator(video_frames[0])
    camera_movement_per_frame = camera_movement_estimator.get_camera_movement(
        video_frames,
        read_from_stub=use_stubs,
        stub_path=stub_paths["camera"]
    )
    camera_movement_estimator.add_adjust_positions_to_tracks(tracks, camera_movement_per_frame)
    
    view_transformer = ViewTransformer(video_frames[0])
    view_transformer.add_transformed_position_to_tracks(tracks)
    
    tracks["ball"] = tracker.interpolate_ball_positions(tracks["ball"])
    tracker.add_position_to_tracks({"ball": tracks["ball"]})
    view_transformer.add_transformed_position_to_tracks({"ball": tracks["ball"]})
    
    speed_and_distance_estimator = SpeedAndDistance_Estimator(
        frame_rate=fps,
        pitch_length_meters=105,
        pitch_width_meters=68
    )
    speed_and_distance_estimator.add_speed_and_distance_to_tracks(tracks)
    
    team_assigner = TeamAssigner()
    if tracks['players'] and len(tracks['players']) > 0 and tracks['players'][0]:
        team_assigner.assign_team_color(video_frames[0], tracks['players'][0])
    else:
        team_assigner.team_colors = {1: np.array([59, 130, 246]), 2: np.array([239, 68, 68])}
    
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
    team_ball_control = []
    for frame_num, player_track in enumerate(tracks['players']):
        ball_bbox = tracks['ball'][frame_num].get(1, {}).get('bbox')
        if ball_bbox is None:
            team_ball_control.append(team_ball_control[-1] if team_ball_control else 0)
            continue
        
        assigned_player = player_assigner.assign_ball_to_player(player_track, ball_bbox)
        
        if assigned_player != -1:
            tracks['players'][frame_num][assigned_player]['has_ball'] = True
            team_ball_control.append(tracks['players'][frame_num][assigned_player]['team'])
        else:
            team_ball_control.append(team_ball_control[-1] if team_ball_control else 0)
    
    player_all_pitch_x = {}
    player_teams = {}
    for frame_num in range(len(video_frames)):
        for player_id, player_data in tracks['players'][frame_num].items():
            tid = player_data.get('team', 1)
            player_teams[player_id] = tid
            pos_t = player_data.get('position_transformed')
            pos_scr = player_data.get('position', [0, 0])
            pitch_pos = transform_to_pitch_coordinates(pos_t, pos_scr, frame_width, frame_height)
            if player_id not in player_all_pitch_x:
                player_all_pitch_x[player_id] = []
            player_all_pitch_x[player_id].append(pitch_pos['x'])

    player_roles = {}
    for team_id in [1, 2]:
        t_players = [pid for pid, tid in player_teams.items() if tid == team_id]
        if not t_players:
            continue
        avg_xs = {pid: (sum(player_all_pitch_x[pid]) / len(player_all_pitch_x[pid])) for pid in t_players if pid in player_all_pitch_x}
        sorted_p = sorted(avg_xs.keys(), key=lambda p: avg_xs[p], reverse=(team_id == 2))
        
        if sorted_p:
            player_roles[sorted_p[0]] = 'goalkeeper'
        for idx, pid in enumerate(sorted_p[1:]):
            ratio = (idx + 1) / len(sorted_p)
            if ratio <= 0.45:
                player_roles[pid] = 'defender'
            elif ratio <= 0.8:
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
            role = player_roles.get(player_id, 'midfielder')
            
            bbox_pct = convert_bbox_to_percentage(player_data['bbox'], frame_width, frame_height)
            screen_pos_pct = convert_position_to_percentage(player_data.get('position', [0, 0]), frame_width, frame_height)
            pitch_pos_pct = transform_to_pitch_coordinates(
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
            
            entity = {
                "id": f"{team_name}_{player_id}",
                "name": f"Player {player_id}",
                "jerseyNumber": int(player_id) % 99,
                "team": team_name,
                "role": role,
                "confidence": 0.94,
                "bbox": bbox_pct,
                "screenPos": screen_pos_pct,
                "pitchPos": pitch_pos_pct,
                "velocity": {"x": vx, "y": vy},
                "speedKmh": round(float(speed_val), 1),
                "distanceCoveredMeters": round(float(dist_val), 1),
                "hasPossession": bool(player_data.get('has_ball', False))
            }
            entities.append(entity)
        
        # Process ball only if detected
        ball_pitch_pos = None
        ball_screen_pos = None
        
        if tracks['ball'] and frame_num < len(tracks['ball']) and tracks['ball'][frame_num].get(1):
            ball_data = tracks['ball'][frame_num][1]
            bb = ball_data.get('bbox', [])
            if len(bb) == 4 and (bb[2] - bb[0] > 1) and (bb[3] - bb[1] > 1):
                center_x = (bb[0] + bb[2]) / 2.0
                center_y = (bb[1] + bb[3]) / 2.0
                ball_screen_pos = convert_position_to_percentage([center_x, center_y], frame_width, frame_height)
                ball_pitch_pos = transform_to_pitch_coordinates(
                    ball_data.get('position_transformed'),
                    [center_x, center_y],
                    frame_width,
                    frame_height
                )
        
        current_possession_team = team_ball_control[frame_num] if frame_num < len(team_ball_control) else 0
        possession_team_name = 'teamA' if current_possession_team == 1 else 'teamB' if current_possession_team == 2 else 'neutral'
        
        possession_player_id = None
        for entity in entities:
            if entity.get('hasPossession'):
                possession_player_id = entity['id']
                break
        
        homography_calibration = view_transformer.get_calibration_percentages()
        phase = classify_phase(entities, possession_team_name)
        event_tag = None
        if (
            possession_player_id
            and prev_possession_player_id
            and possession_team_name == prev_possession_team_name
            and possession_player_id != prev_possession_player_id
        ):
            event_tag = "CV possession transfer"
        
        frame_data = {
            "frameIndex": frame_num,
            "timestampSec": round(float(time_sec), 2),
            "timeDisplay": time_display,
            "entities": entities,
            "ballPos": ball_pitch_pos,
            "ballScreenPos": ball_screen_pos,
            "possessionTeam": possession_team_name,
            "possessionPlayerId": possession_player_id,
            "phase": phase,
            "eventTag": event_tag,
            "homographyCalibration": homography_calibration
        }
        frames_data.append(frame_data)
        prev_possession_player_id = possession_player_id or prev_possession_player_id
        prev_possession_team_name = possession_team_name if possession_player_id else prev_possession_team_name
    
    passing_network_a = calculate_real_passing_network(frames_data, 'teamA')
    passing_network_b = calculate_real_passing_network(frames_data, 'teamB')
    
    formation_a = detect_team_formation_from_nodes(passing_network_a['nodes'], is_team_b=False)
    formation_b = detect_team_formation_from_nodes(passing_network_b['nodes'], is_team_b=True)
    
    team_a_frames = sum(1 for f in team_ball_control if f == 1)
    team_b_frames = sum(1 for f in team_ball_control if f == 2)
    total_controlled = team_a_frames + team_b_frames or 1
    possession_pct = round((team_a_frames / total_controlled) * 100, 1)
    
    total_passes_a = sum(e['count'] for e in passing_network_a['edges'])
    total_passes_b = sum(e['count'] for e in passing_network_b['edges'])
    total_passes = total_passes_a + total_passes_b
    pitch_control = calculate_pitch_control(frames_data)
    compactness_a = calculate_compactness(frames_data, 'teamA')
    compactness_b = calculate_compactness(frames_data, 'teamB')
    xt_summary = summarize_xt(frames_data)
    defensive_transitions = 0
    previous_team = 'neutral'
    for f in frames_data:
        current_team = f.get('possessionTeam', 'neutral')
        if current_team in ('teamA', 'teamB') and previous_team in ('teamA', 'teamB') and current_team != previous_team:
            defensive_transitions += 1
        if current_team in ('teamA', 'teamB'):
            previous_team = current_team
    key_recoveries = sum(1 for f in frames_data if f.get('eventTag') == 'CV possession transfer')
    
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
            return "#3b82f6"
        return "#{:02x}{:02x}{:02x}".format(int(rgb[0]), int(rgb[1]), int(rgb[2]))
        
    team_a_color = rgb_to_hex(team_assigner.team_colors.get(1, [59, 130, 246]))
    team_b_color = rgb_to_hex(team_assigner.team_colors.get(2, [239, 68, 68]))
    
    dimension = {
        "name": "Standard Football Pitch",
        "lengthMeters": 105,
        "widthMeters": 68,
        "pitchRatio": round(105 / 68, 3),
        "surfaceTheme": "grass",
        "landmarks": [
            {"name": "Center Circle", "pitchPos": {"x": 50, "y": 50}},
            {"name": "Penalty Box Team A", "pitchPos": {"x": 16.5, "y": 50}},
            {"name": "Penalty Box Team B", "pitchPos": {"x": 83.5, "y": 50}}
        ]
    }
    
    result = {
        "id": "yolo-match-real",
        "name": f"Broadcast CV Analysis: {os.path.basename(resolved_path)}",
        "sport": "football",
        "description": "Automated Computer Vision tracking with YOLOv8, ByteTrack, and Homography Transformation",
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
            "sport": "football"
        },
        "teamB": {
            "id": "teamB",
            "name": "Team Red / Dark",
            "shortName": "TMB",
            "primaryColor": team_b_color,
            "secondaryColor": "#991b1b",
            "textColor": "#ffffff",
            "formation": formation_b,
            "sport": "football"
        },
        "passingNetworkA": passing_network_a,
        "passingNetworkB": passing_network_b,
        "baseMetrics": base_metrics,
        "dimension": dimension,
        "videoPlaceholderTheme": "grass"
    }
    
    result = convert_to_python_types(result)
    if use_cache:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f)
        result["cache"] = {"hit": False, "path": cache_path}

    return result


@app.post("/api/process-video")
async def process_video(request: VideoProcessRequest):
    """Process a video file and return tactical analysis data"""
    try:
        match_data = process_video_to_match_data(
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
        raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")


@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file for processing"""
    try:
        file_extension = os.path.splitext(file.filename)[1] or ".mp4"
        clean_filename = f"upload_{os.path.splitext(file.filename)[0].replace(' ', '_')}{file_extension}"
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
        raise HTTPException(status_code=500, detail=f"Error uploading video: {str(e)}")


@app.get("/api/videos")
async def list_videos():
    """List available video files"""
    try:
        videos = []
        seen = set()
        for input_dir in [VIDEO_INPUT_DIR, ARCHIVE2_INPUT_DIR]:
            if os.path.exists(input_dir):
                for filename in os.listdir(input_dir):
                    if filename.endswith(('.mp4', '.avi', '.mov', '.mkv')) and not filename.startswith('.'):
                        if filename not in seen:
                            seen.add(filename)
                            file_path = os.path.join(input_dir, filename)
                            videos.append({
                                "filename": filename,
                                "path": file_path,
                                "size": os.path.getsize(file_path),
                                "public_url": f"/videos/{filename}" if os.path.exists(os.path.join(base_dir, 'public', 'videos', filename)) else f"/videos/archive/{filename}"
                            })
        
        return {"videos": videos}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing videos: {str(e)}")


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_exists": os.path.exists(MODEL_PATH),
        "input_dir_exists": os.path.exists(VIDEO_INPUT_DIR),
        "output_dir_exists": os.path.exists(VIDEO_OUTPUT_DIR)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
