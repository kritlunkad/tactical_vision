from ultralytics import YOLO
import supervision as sv
import torch
import pickle
import os
import numpy as np
import pandas as pd
import cv2
import sys
sys.path.append('../')
from utils import get_center_of_bbox, get_bbox_width, get_foot_position


class HockeyTracker:
    """
    Hockey tracker for 7-class model:
    0: centriod (Center Ice) -> LANDMARK
    1: faceoff (Faceoff Dots) -> LANDMARK
    2: goal (Goal Frame) -> LANDMARK
    3: goalie (Goaltender) -> players (role=goaltender)
    4: player (Players) -> players
    5: puck (Puck) -> puck
    6: referee (Referee) -> referees
    Landmarks are NOT tracked, only collected for homography calibration.
    """

    # Normalize various naming typos/cases to canonical
    LANDMARK_NAMES = {"centriod", "center ice", "centre ice", "faceoff", "face-off", "faceoff dots", "goal", "goal frame"}
    GOALIE_NAMES = {"goalie", "goaltender", "goalkeeper"}
    PLAYER_NAMES = {"player", "players"}
    PUCK_NAMES = {"puck"}
    REFEREE_NAMES = {"referee"}

    def __init__(self, model_path, batch_size=32, device='auto'):
        self.model = YOLO(model_path)
        self.batch_size = batch_size
        if device == 'auto':
            if torch.cuda.is_available():
                self.device = 0
            elif torch.backends.mps.is_available():
                self.device = 'mps'
            else:
                self.device = 'cpu'
        else:
            self.device = device
        self.tracker = sv.ByteTrack()
        # Landmarks per frame for RinkViewTransformer
        self.landmarks_per_frame = []

    def add_position_to_tracks(self, tracks):
        for object, object_tracks in tracks.items():
            for frame_num, track in enumerate(object_tracks):
                for track_id, track_info in track.items():
                    bbox = track_info['bbox']
                    if object == 'puck':
                        position = get_center_of_bbox(bbox)
                    else:
                        position = get_foot_position(bbox)
                    tracks[object][frame_num][track_id]['position'] = position

    def interpolate_puck_positions(self, puck_positions):
        # Same as ball interpolation but for puck track_id=1
        puck_positions_raw = [x.get(1, {}).get('bbox', []) for x in puck_positions]
        df = pd.DataFrame(puck_positions_raw, columns=['x1', 'y1', 'x2', 'y2'])
        df = df.interpolate()
        df = df.bfill()
        df = df.ffill()
        interpolated = []
        for x in df.to_numpy().tolist():
            if len(x) == 4 and np.all(np.isfinite(x)) and x[2] > x[0] and x[3] > x[1]:
                interpolated.append({1: {"bbox": x}})
            else:
                interpolated.append({})
        return interpolated

    # Alias for compatibility
    def interpolate_ball_positions(self, puck_positions):
        return self.interpolate_puck_positions(puck_positions)

    def detect_frames(self, frames):
        detections = []
        for i in range(0, len(frames), self.batch_size):
            detections_batch = self.model.predict(
                frames[i:i + self.batch_size],
                conf=0.1,
                device=self.device,
                verbose=False,
            )
            detections += detections_batch
        return detections

    def _sanitize_detections(self, detections, frame_shape):
        if detections.xyxy is None or len(detections) == 0:
            return detections
        frame_h, frame_w = frame_shape[:2]
        xyxy = np.asarray(detections.xyxy, dtype=float)
        confidences = None if detections.confidence is None else np.asarray(detections.confidence, dtype=float)
        class_ids = None if detections.class_id is None else np.asarray(detections.class_id, dtype=float)
        widths = xyxy[:, 2] - xyxy[:, 0]
        heights = xyxy[:, 3] - xyxy[:, 1]
        # Puck can be very small (1.5px), keep threshold low for hockey
        mask = (
            np.all(np.isfinite(xyxy), axis=1)
            & (widths > 1.5)
            & (heights > 1.5)
            & (xyxy[:, 2] > 0)
            & (xyxy[:, 3] > 0)
            & (xyxy[:, 0] < frame_w)
            & (xyxy[:, 1] < frame_h)
        )
        if confidences is not None:
            mask &= np.isfinite(confidences)
            mask &= confidences >= 0.0
            mask &= confidences <= 1.0
        if class_ids is not None:
            mask &= np.isfinite(class_ids)
        detections = detections[mask]
        if len(detections) == 0:
            return detections
        detections.xyxy[:, [0, 2]] = np.clip(detections.xyxy[:, [0, 2]], 0, frame_w - 1)
        detections.xyxy[:, [1, 3]] = np.clip(detections.xyxy[:, [1, 3]], 0, frame_h - 1)
        if detections.confidence is not None:
            detections.confidence = np.nan_to_num(detections.confidence, nan=0.0, posinf=1.0, neginf=0.0)
        return detections

    def _safe_update_tracker(self, detections):
        try:
            return self.tracker.update_with_detections(detections)
        except ValueError as exc:
            if "invalid numeric" not in str(exc) and "matrix contains" not in str(exc):
                raise
            self.tracker = sv.ByteTrack()
            if len(detections) == 0:
                return detections
            try:
                return self.tracker.update_with_detections(detections)
            except ValueError:
                return sv.Detections.empty()

    def _classify_raw_class(self, raw_name: str):
        n = raw_name.strip().lower()
        if n in self.LANDMARK_NAMES:
            if n in {"centriod", "center ice", "centre ice"}:
                return "center_ice"
            elif "faceoff" in n or "face-off" in n:
                return "faceoff"
            elif "goal" in n:
                return "goal_frame"
            return "landmark"
        if n in self.GOALIE_NAMES:
            return "goalie"
        if n in self.PLAYER_NAMES:
            return "player"
        if n in self.PUCK_NAMES:
            return "puck"
        if n in self.REFEREE_NAMES:
            return "referee"
        return "unknown"

    def get_object_tracks(self, frames, read_from_stub=False, stub_path=None):

        if read_from_stub and stub_path is not None and os.path.exists(stub_path):
            with open(stub_path, 'rb') as f:
                tracks = pickle.load(f)
            # Backward compat: ensure puck key exists
            if "puck" not in tracks and "ball" in tracks:
                tracks["puck"] = tracks.pop("ball")
            if len(tracks.get('players', [])) == len(frames):
                # Try to load landmarks if saved
                lm_path = stub_path.replace("_tracks.pkl", "_landmarks.pkl")
                if os.path.exists(lm_path):
                    with open(lm_path, 'rb') as lf:
                        self.landmarks_per_frame = pickle.load(lf)
                return tracks

        detections = self.detect_frames(frames)

        tracks = {
            "players": [],
            "referees": [],
            "puck": []
        }
        landmarks_per_frame = []

        for frame_num, detection in enumerate(detections):
            cls_names = detection.names
            cls_names_inv = {v: k for k, v in cls_names.items()}

            detection_supervision = sv.Detections.from_ultralytics(detection)
            detection_supervision = self._sanitize_detections(
                detection_supervision,
                frames[frame_num].shape,
            )

            # Collect landmarks separately
            frame_landmarks = {"center_ice": [], "faceoff": [], "goal_frame": []}

            # Normalize player/goalie classes for tracking
            # We need to handle landmark classes: remove them from tracking pipeline
            if len(detection_supervision) > 0:
                # Build mask for tracking vs landmarks
                keep_indices = []
                for idx, class_id in enumerate(detection_supervision.class_id):
                    raw_name = cls_names[int(class_id)] if int(class_id) in cls_names else str(class_id)
                    cat = self._classify_raw_class(raw_name)
                    if cat in ("center_ice", "faceoff", "goal_frame", "landmark"):
                        # Save bbox as landmark
                        bbox = detection_supervision.xyxy[idx].tolist()
                        if cat == "center_ice":
                            frame_landmarks["center_ice"].append({"bbox": bbox, "center": get_center_of_bbox(bbox)})
                        elif cat == "faceoff":
                            frame_landmarks["faceoff"].append({"bbox": bbox, "center": get_center_of_bbox(bbox)})
                        elif cat in ("goal_frame", "landmark"):
                            # goal_frame or unknown goal-related
                            frame_landmarks["goal_frame"].append({"bbox": bbox, "center": get_center_of_bbox(bbox)})
                        # Do not keep for tracking
                    else:
                        # Map goalie -> player for tracking
                        if cat == "goalie":
                            # Remap class_id to player if exists
                            if "player" in cls_names_inv or "players" in cls_names_inv:
                                target_key = "player" if "player" in cls_names_inv else "players"
                                detection_supervision.class_id[idx] = cls_names_inv[target_key]
                            elif "goalie" in cls_names_inv:
                                pass
                        keep_indices.append(idx)

                if len(keep_indices) < len(detection_supervision):
                    detection_supervision = detection_supervision[keep_indices]

            landmarks_per_frame.append(frame_landmarks)

            tracks["players"].append({})
            tracks["referees"].append({})
            tracks["puck"].append({})

            # Track Objects (players + referees)
            detection_with_tracks = self._safe_update_tracker(detection_supervision)

            # Resolve class ids for tracking
            # Need to handle that after filtering, class_ids are normalized
            for frame_detection in detection_with_tracks:
                bbox = frame_detection[0].tolist()
                cls_id = frame_detection[3]
                track_id = frame_detection[4]
                # Get raw name
                raw_name = cls_names[int(cls_id)] if int(cls_id) in cls_names else "player"
                cat = self._classify_raw_class(raw_name)
                # After remapping, goalie is already player
                if cat in ("player", "goalie") or raw_name.lower() in ("player", "players", "goalie", "goaltender", "goalkeeper"):
                    tracks["players"][frame_num][track_id] = {"bbox": bbox, "raw_class": raw_name}
                    if cat == "goalie" or raw_name.lower() in ("goalie", "goaltender"):
                        tracks["players"][frame_num][track_id]["is_goalie"] = True
                elif cat == "referee" or raw_name.lower() == "referee":
                    tracks["referees"][frame_num][track_id] = {"bbox": bbox}

            # Puck detection - not tracked via ByteTrack, direct
            for frame_detection in detection_supervision:
                bbox = frame_detection[0].tolist()
                cls_id = frame_detection[3]
                raw_name = cls_names[int(cls_id)] if int(cls_id) in cls_names else ""
                cat = self._classify_raw_class(raw_name)
                if cat == "puck" or raw_name.lower() == "puck":
                    tracks["puck"][frame_num][1] = {"bbox": bbox}

        self.landmarks_per_frame = landmarks_per_frame

        if read_from_stub and stub_path is not None:
            with open(stub_path, 'wb') as f:
                pickle.dump(tracks, f)
            # Also save landmarks
            lm_path = stub_path.replace("_tracks.pkl", "_landmarks.pkl")
            with open(lm_path, 'wb') as lf:
                pickle.dump(landmarks_per_frame, lf)

        return tracks

    def draw_ellipse(self, frame, bbox, color, track_id=None):
        y2 = int(bbox[3])
        x_center, _ = get_center_of_bbox(bbox)
        width = get_bbox_width(bbox)
        cv2.ellipse(
            frame,
            center=(x_center, y2),
            axes=(int(width), int(0.35 * width)),
            angle=0.0,
            startAngle=-45,
            endAngle=235,
            color=color,
            thickness=2,
            lineType=cv2.LINE_4
        )
        rectangle_width = 40
        rectangle_height = 20
        x1_rect = x_center - rectangle_width // 2
        x2_rect = x_center + rectangle_width // 2
        y1_rect = (y2 - rectangle_height // 2) + 15
        y2_rect = (y2 + rectangle_height // 2) + 15
        if track_id is not None:
            cv2.rectangle(frame, (int(x1_rect), int(y1_rect)), (int(x2_rect), int(y2_rect)), color, cv2.FILLED)
            x1_text = x1_rect + 12
            if track_id > 99:
                x1_text -= 10
            cv2.putText(frame, f"{track_id}", (int(x1_text), int(y1_rect + 15)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        return frame

    def draw_traingle(self, frame, bbox, color):
        y = int(bbox[1])
        x, _ = get_center_of_bbox(bbox)
        triangle_points = np.array([[x, y], [x - 10, y - 20], [x + 10, y - 20]])
        cv2.drawContours(frame, [triangle_points], 0, color, cv2.FILLED)
        cv2.drawContours(frame, [triangle_points], 0, (0, 0, 0), 2)
        return frame

    def draw_team_ball_control(self, frame, frame_num, team_ball_control):
        overlay = frame.copy()
        cv2.rectangle(overlay, (1350, 850), (1900, 970), (255, 255, 255), -1)
        alpha = 0.4
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
        team_ball_control_till_frame = team_ball_control[:frame_num + 1]
        team_1_num_frames = team_ball_control_till_frame[team_ball_control_till_frame == 1].shape[0]
        team_2_num_frames = team_ball_control_till_frame[team_ball_control_till_frame == 2].shape[0]
        total_controlled_frames = team_1_num_frames + team_2_num_frames
        if total_controlled_frames == 0:
            team_1 = team_2 = 0
        else:
            team_1 = team_1_num_frames / total_controlled_frames
            team_2 = team_2_num_frames / total_controlled_frames
        cv2.putText(frame, f"Team 1 Puck Control: {team_1*100:.2f}%", (1400, 900), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 3)
        cv2.putText(frame, f"Team 2 Puck Control: {team_2*100:.2f}%", (1400, 950), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 3)
        return frame

    def draw_annotations(self, video_frames, tracks, team_ball_control):
        output_video_frames = []
        for frame_num, frame in enumerate(video_frames):
            frame = frame.copy()
            player_dict = tracks["players"][frame_num]
            puck_dict = tracks["puck"][frame_num] if "puck" in tracks else tracks.get("ball", [{}])[frame_num]
            referee_dict = tracks["referees"][frame_num]
            for track_id, player in player_dict.items():
                color = player.get("team_color", (0, 0, 255))
                frame = self.draw_ellipse(frame, player["bbox"], color, track_id)
                if player.get('has_puck', False) or player.get('has_ball', False):
                    frame = self.draw_traingle(frame, player["bbox"], (0, 0, 255))
            for _, referee in referee_dict.items():
                frame = self.draw_ellipse(frame, referee["bbox"], (0, 255, 255))
            for track_id, puck in puck_dict.items():
                frame = self.draw_traingle(frame, puck["bbox"], (0, 255, 0))
            frame = self.draw_team_ball_control(frame, frame_num, team_ball_control)
            output_video_frames.append(frame)
        return output_video_frames
