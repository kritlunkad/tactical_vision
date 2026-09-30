import numpy as np
import cv2


class RinkViewTransformer():
    """
    Hockey Rink ViewTransformer using YOLO-detected landmarks.
    Uses Center Ice, Faceoff Dots, Goal Frames as calibration points.
    Falls back to white-ice detection or static quad if landmarks insufficient.
    Separate from football ViewTransformer - no football logic touched.
    """

    def __init__(self, sample_frame=None, landmarks_per_frame=None, frame_width=1280, frame_height=720, video_frames=None):
        if sample_frame is not None:
            frame_height, frame_width = sample_frame.shape[:2]

        self.frame_width = frame_width
        self.frame_height = frame_height
        self.frame_transforms = []
        self.frame_calibrations = []
        self.frame_visible_ranges = []

        if video_frames:
            for frame in video_frames:
                pixel_vertices, target_vertices, x_min, x_max = self._compute_from_frame(frame)
                self.frame_transforms.append(cv2.getPerspectiveTransform(pixel_vertices, target_vertices))
                self.frame_calibrations.append(pixel_vertices)
                self.frame_visible_ranges.append((x_min, x_max))
            self.pixel_vertices = self.frame_calibrations[0]
            self.visible_pitch_x_min, self.visible_pitch_x_max = self.frame_visible_ranges[0]
            self.target_vertices = np.array([
                [self.visible_pitch_x_min, 0.0],
                [self.visible_pitch_x_max, 0.0],
                [self.visible_pitch_x_max, 100.0],
                [self.visible_pitch_x_min, 100.0]
            ], dtype=np.float32)
            self.perspective_transformer = self.frame_transforms[0]
            return

        self.pixel_vertices, self.target_vertices, self.visible_pitch_x_min, self.visible_pitch_x_max = self._compute_from_frame(sample_frame)

        # Compute perspective transform
        try:
            self.perspective_transformer = cv2.getPerspectiveTransform(self.pixel_vertices, self.target_vertices)
        except Exception:
            # Fallback to identity if degenerate
            self.perspective_transformer = cv2.getPerspectiveTransform(
                self._fallback_quad(), 
                np.array([[0,0],[100,0],[100,100],[0,100]], dtype=np.float32)
            )

    def _compute_from_frame(self, frame):
        pixel_vertices = self._detect_rink_quad(frame)
        visible_x_min, visible_x_max = self._estimate_visible_rink_range_from_lines(frame, pixel_vertices)
        target_vertices = np.array([
            [visible_x_min, 0.0],
            [visible_x_max, 0.0],
            [visible_x_max, 100.0],
            [visible_x_min, 100.0]
        ], dtype=np.float32)
        return pixel_vertices, target_vertices, visible_x_min, visible_x_max

    def _compute_from_landmarks(self, landmarks_per_frame, frame_w, frame_h):
        """
        Compute homography from aggregated landmark detections across frames.
        landmarks_per_frame: list of dicts {center_ice: [...], faceoff: [...], goal_frame: [...]}
        Each entry has bbox and center.
        We aggregate most frequent positions then map to known world coordinates.
        """
        # Aggregate all landmarks
        all_centers = []
        all_faceoffs = []
        all_goals = []

        for lm in landmarks_per_frame:
            for item in lm.get("center_ice", []):
                all_centers.append(item["center"])
            for item in lm.get("faceoff", []):
                all_faceoffs.append(item["center"])
            for item in lm.get("goal_frame", []):
                all_goals.append(item["center"])

        # Known world coordinates for hockey rink (0-100 normalized)
        # Center Ice -> (50,50)
        # Goal Frames -> (8,50) and (92,50)  [or 5/95 depending on rink]
        # Faceoff dots -> typical NHL positions:
        #   Defensive zone left: (19.5, 31) , (19.5, 69)
        #   Defensive zone right: (80.5, 31), (80.5, 69)
        #   Neutral zone: (42.5,31), (42.5,69), (57.5,31), (57.5,69)
        # For simplicity, we use 4-point quad derived from landmarks or fallback.

        # Try to find robust quad from landmark extremes
        # Use goal frames for x extremes, faceoff + center for y
        try:
            if len(all_goals) >= 2:
                # Two goals visible -> use them for left/right boundaries
                xs = [c[0] for c in all_goals]
                # Classify goals by x position
                left_goals = [c for c in all_goals if c[0] < frame_w * 0.5]
                right_goals = [c for c in all_goals if c[0] >= frame_w * 0.5]
                if left_goals and right_goals:
                    left_x = float(np.median([c[0] for c in left_goals]))
                    right_x = float(np.median([c[0] for c in right_goals]))
                    # Use median y for goal line y
                    left_y = float(np.median([c[1] for c in left_goals]))
                    right_y = float(np.median([c[1] for c in right_goals]))
                else:
                    left_x = float(min(xs))
                    right_x = float(max(xs))
                    left_y = right_y = frame_h * 0.5
                # Now need top/bottom y - estimate from frame or faceoffs
                if all_faceoffs:
                    ys = [c[1] for c in all_faceoffs]
                    top_y = float(np.percentile(ys, 15)) - frame_h * 0.1
                    bottom_y = float(np.percentile(ys, 85)) + frame_h * 0.1
                    # Clamp
                    top_y = max(frame_h * 0.15, min(frame_h * 0.35, top_y))
                    bottom_y = max(frame_h * 0.65, min(frame_h * 0.92, bottom_y))
                elif all_centers:
                    cy = float(np.median([c[1] for c in all_centers]))
                    top_y = cy - frame_h * 0.25
                    bottom_y = cy + frame_h * 0.25
                else:
                    top_y = frame_h * 0.22
                    bottom_y = frame_h * 0.85

                # Build quad: perspective trapezoid (top narrower due to camera angle)
                # Top is narrower (rink far end)
                top_inset = frame_w * 0.08
                bottom_inset = frame_w * 0.02
                pixel_vertices = np.array([
                    [left_x + top_inset, top_y],
                    [right_x - top_inset, top_y],
                    [right_x + bottom_inset, bottom_y],
                    [left_x - bottom_inset, bottom_y]
                ], dtype=np.float32)

                # World coordinates: map goals to 8,92 and center to 50
                # Use collected centers to calibrate x range if center ice visible
                if all_centers and len(all_goals) >= 1:
                    cx = float(np.median([c[0] for c in all_centers]))
                    # Estimate where 0 and 100 would be based on center and goals
                    # If we have left goal at ~8 and center at 50, scale is linear
                    # For now use standard 0-100, but adjust if center is offset (camera shows half rink)
                    visible_x_min, visible_x_max = self._estimate_visible_rink_from_center(cx, left_x, right_x, frame_w)
                else:
                    visible_x_min, visible_x_max = 0.0, 100.0

                target_vertices = np.array([
                    [visible_x_min, 0.0],
                    [visible_x_max, 0.0],
                    [visible_x_max, 100.0],
                    [visible_x_min, 100.0]
                ], dtype=np.float32)

                return pixel_vertices, target_vertices, visible_x_min, visible_x_max

            elif all_centers:
                # Only center ice visible - use center as anchor
                cx, cy = float(np.median([c[0] for c in all_centers])), float(np.median([c[1] for c in all_centers]))
                # Estimate quad around center
                w = frame_w * 0.85
                h = frame_h * 0.60
                pixel_vertices = np.array([
                    [cx - w*0.45, cy - h*0.45],
                    [cx + w*0.45, cy - h*0.45],
                    [cx + w*0.50, cy + h*0.45],
                    [cx - w*0.50, cy + h*0.45]
                ], dtype=np.float32)
                # Center at 50, estimate visible range
                visible_x_min, visible_x_max = self._estimate_visible_rink_from_center(cx, cx - w*0.4, cx + w*0.4, frame_w)
                target_vertices = np.array([
                    [visible_x_min, 0.0],
                    [visible_x_max, 0.0],
                    [visible_x_max, 100.0],
                    [visible_x_min, 100.0]
                ], dtype=np.float32)
                return pixel_vertices, target_vertices, visible_x_min, visible_x_max

        except Exception as e:
            print(f"Rink landmark homography failed: {e}, using fallback")

        # Fallback to rink quad detection
        quad = self._detect_rink_quad(None)
        return quad, np.array([[0,0],[100,0],[100,100],[0,100]], dtype=np.float32), 0.0, 100.0

    def _estimate_visible_rink_from_center(self, center_x, left_x, right_x, frame_w):
        """
        Estimate visible rink x range similar to football's visible_pitch_x_range
        but for hockey's 2 goals.

        """
        # Simple heuristic: if center_x is left of frame center, we see more right side
        frame_center = frame_w * 0.5
        # If center is at <45% frame width, likely viewing right half (common broadcast)
        # left= (50 - center_norm*100)/(1-center_norm) logic from football but adapted
        # For now, keep full rink 0-100 unless strong evidence of half-rink
        # Check if we only see one goal
        if left_x > frame_w * 0.1 and right_x < frame_w * 0.9:
            # Both goals visible - full rink
            return 0.0, 100.0

        # If only left goal visible and center near right third
        if center_x > frame_w * 0.55:
            # Right half visible more - estimate left visible
            # Rough: left = 50 - (center_norm*100) over (1-center_norm)
            # Simulate by returning 0-100 still for stability
            return 0.0, 100.0

        return 0.0, 100.0

    def _estimate_visible_rink_range_from_lines(self, frame, pixel_vertices):
        if frame is None:
            return 0.0, 100.0

        line_positions = self._detect_rink_line_positions(frame, pixel_vertices)
        red_lines = line_positions.get("red", [])
        blue_lines = line_positions.get("blue", [])

        if red_lines:
            n = red_lines[0]
            if n < 0.45:
                left = (50.0 - 100.0 * n) / (1.0 - n)
                if -5.0 <= left <= 45.0:
                    return max(0.0, float(left)), 100.0
            if n > 0.55:
                right = 50.0 / n
                if 55.0 <= right <= 105.0:
                    return 0.0, min(100.0, float(right))
            return 0.0, 100.0

        if blue_lines:
            n = blue_lines[0]
            if n < 0.35:
                # Left-side screen blue line commonly means the camera is showing
                # the right attacking zone: blue line ~= 67% rink length.
                left = (67.0 - 100.0 * n) / (1.0 - n)
                if 35.0 <= left <= 70.0:
                    return float(left), 100.0
            if n > 0.65:
                right = 33.0 / n
                if 35.0 <= right <= 70.0:
                    return 0.0, float(right)

        return 0.0, 100.0

    def _detect_rink_line_positions(self, frame, pixel_vertices):
        h, w = frame.shape[:2]
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        red_a = cv2.inRange(hsv, np.array([0, 35, 70]), np.array([14, 255, 255]))
        red_b = cv2.inRange(hsv, np.array([164, 35, 70]), np.array([180, 255, 255]))
        red = cv2.bitwise_or(red_a, red_b)
        blue = cv2.inRange(hsv, np.array([78, 20, 45]), np.array([150, 255, 255]))

        full_transform = cv2.getPerspectiveTransform(
            pixel_vertices.astype(np.float32),
            np.array([[0, 0], [100, 0], [100, 100], [0, 100]], dtype=np.float32)
        )

        return {
            "red": self._line_norm_x_candidates(red, full_transform, h, w),
            "blue": self._line_norm_x_candidates(blue, full_transform, h, w)
        }

    def _line_norm_x_candidates(self, mask, full_transform, h, w):
        mask = mask.copy()
        mask[:int(h * 0.16), :] = 0
        mask[int(h * 0.96):, :] = 0
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
        edges = cv2.Canny(mask, 40, 120)
        lines = cv2.HoughLinesP(
            edges,
            1,
            np.pi / 180,
            threshold=24,
            minLineLength=max(40, int(h * 0.13)),
            maxLineGap=28
        )
        if lines is None:
            return []

        candidates = []
        for x1, y1, x2, y2 in lines[:, 0, :]:
            dx = float(x2 - x1)
            dy = float(y2 - y1)
            length = (dx * dx + dy * dy) ** 0.5
            if length < h * 0.13:
                continue
            angle = abs(np.degrees(np.arctan2(dy, dx)))
            if not (35.0 <= angle <= 145.0):
                continue
            mid = np.array([[[float((x1 + x2) / 2.0), float((y1 + y2) / 2.0)]]], dtype=np.float32)
            norm = cv2.perspectiveTransform(mid, full_transform).reshape(-1, 2)[0]
            nx, ny = float(norm[0]) / 100.0, float(norm[1]) / 100.0
            if 0.02 <= nx <= 0.98 and 0.05 <= ny <= 0.95:
                candidates.append((length, nx))

        candidates.sort(reverse=True)
        deduped = []
        for _, nx in candidates:
            if all(abs(nx - existing) > 0.08 for existing in deduped):
                deduped.append(nx)
        return deduped[:3]

    def _detect_rink_quad(self, frame):
        if frame is None:
            return self._fallback_quad()

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower_ice = np.array([0, 0, 120])
        upper_ice = np.array([180, 70, 255])
        mask_ice = cv2.inRange(hsv, lower_ice, upper_ice)
        mask_ice[:int(self.frame_height * 0.14), :] = 0

        kernel = np.ones((9, 9), np.uint8)
        mask_ice = cv2.morphologyEx(mask_ice, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask_ice = cv2.morphologyEx(mask_ice, cv2.MORPH_OPEN, kernel, iterations=1)

        rows = []
        min_row_coverage = max(30, int(self.frame_width * 0.22))
        for y in range(self.frame_height):
            xs = np.flatnonzero(mask_ice[y] > 0)
            if xs.size >= min_row_coverage:
                rows.append((y, float(np.percentile(xs, 1)), float(np.percentile(xs, 99))))

        if len(rows) < max(20, self.frame_height * 0.15):
            return self._fallback_quad()

        top_rows = rows[:max(5, len(rows) // 8)]
        bottom_rows = rows[-max(5, len(rows) // 8):]
        top_y = float(np.median([r[0] for r in top_rows]))
        bottom_y = float(np.median([r[0] for r in bottom_rows]))

        top_left = float(np.median([r[1] for r in top_rows]))
        top_right = float(np.median([r[2] for r in top_rows]))
        bottom_left = float(np.median([r[1] for r in bottom_rows]))
        bottom_right = float(np.median([r[2] for r in bottom_rows]))

        quad = np.array([
            [top_left, top_y],
            [top_right, top_y],
            [bottom_right, bottom_y],
            [bottom_left, bottom_y]
        ], dtype=np.float32)

        area = cv2.contourArea(quad)
        if area < (self.frame_width * self.frame_height * 0.15):
            return self._fallback_quad()

        return quad

    def _fallback_quad(self):
        w = float(self.frame_width)
        h = float(self.frame_height)
        # Slightly different for rink - boards are straight, not football curved
        return np.array([
            [0.04 * w, 0.18 * h],
            [0.96 * w, 0.18 * h],
            [0.98 * w, 0.88 * h],
            [0.02 * w, 0.88 * h]
        ], dtype=np.float32)

    def get_calibration_percentages(self, frame_num=0):
        vertices = self.pixel_vertices
        if self.frame_calibrations:
            vertices = self.frame_calibrations[min(frame_num, len(self.frame_calibrations) - 1)]
        return [
            {"x": float((x / self.frame_width) * 100.0), "y": float((y / self.frame_height) * 100.0)}
            for x, y in vertices
        ]

    def get_visible_pitch_range(self, frame_num=0):
        x_min, x_max = self.visible_pitch_x_min, self.visible_pitch_x_max
        if self.frame_visible_ranges:
            x_min, x_max = self.frame_visible_ranges[min(frame_num, len(self.frame_visible_ranges) - 1)]
        return {
            "xMin": float(x_min),
            "xMax": float(x_max),
            "yMin": 0.0,
            "yMax": 100.0
        }

    def transform_point(self, point, frame_num=0):
        if point is None:
            return None
        pt = np.array(point, dtype=np.float32)
        if not np.all(np.isfinite(pt)) or pt.size < 2:
            return None
        reshaped_point = pt.reshape(-1, 1, 2)
        try:
            transformer = self.perspective_transformer
            if self.frame_transforms:
                transformer = self.frame_transforms[min(frame_num, len(self.frame_transforms) - 1)]
            transformed_point = cv2.perspectiveTransform(reshaped_point, transformer)
        except Exception:
            return None
        res = transformed_point.reshape(-1, 2)[0]
        px = max(2.0, min(98.0, float(res[0])))
        py = max(2.0, min(98.0, float(res[1])))
        return [px, py]

    def add_transformed_position_to_tracks(self, tracks):
        for obj, object_tracks in tracks.items():
            for frame_num, track in enumerate(object_tracks):
                for track_id, track_info in track.items():
                    position = track_info.get('position_adjusted') or track_info.get('position')
                    if position is not None:
                        position_transformed = self.transform_point(position, frame_num)
                        tracks[obj][frame_num][track_id]['position_transformed'] = position_transformed
