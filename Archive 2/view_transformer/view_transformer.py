import numpy as np 
import cv2

class ViewTransformer():
    def __init__(self, sample_frame=None, frame_width=1280, frame_height=720):
        if sample_frame is not None:
            frame_height, frame_width = sample_frame.shape[:2]

        self.frame_width = frame_width
        self.frame_height = frame_height
        self.pixel_vertices = self._detect_pitch_quad(sample_frame)
        self.visible_pitch_x_min, self.visible_pitch_x_max = self._estimate_visible_pitch_x_range(sample_frame)
        self.target_vertices = np.array([
            [self.visible_pitch_x_min, 0.0],
            [self.visible_pitch_x_max, 0.0],
            [self.visible_pitch_x_max, 100.0],
            [self.visible_pitch_x_min, 100.0]
        ], dtype=np.float32)
        self.perspective_transformer = cv2.getPerspectiveTransform(self.pixel_vertices, self.target_vertices)

    def _detect_pitch_quad(self, frame):
        if frame is None:
            return self._fallback_quad()

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, np.array([30, 30, 30]), np.array([95, 255, 255]))
        kernel = np.ones((9, 9), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

        rows = []
        min_row_coverage = max(20, int(self.frame_width * 0.12))
        for y in range(self.frame_height):
            xs = np.flatnonzero(mask[y] > 0)
            if xs.size >= min_row_coverage:
                rows.append((y, float(np.percentile(xs, 2)), float(np.percentile(xs, 98))))

        if len(rows) < max(20, self.frame_height * 0.2):
            return self._fallback_quad()

        top_rows = rows[:max(5, len(rows) // 12)]
        bottom_rows = rows[-max(5, len(rows) // 12):]
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
        if area < (self.frame_width * self.frame_height * 0.2):
            return self._fallback_quad()

        return quad

    def _estimate_visible_pitch_x_range(self, frame):
        if frame is None:
            return 0.0, 100.0

        full_pitch_transform = cv2.getPerspectiveTransform(
            self.pixel_vertices,
            np.array([
                [0.0, 0.0],
                [100.0, 0.0],
                [100.0, 100.0],
                [0.0, 100.0]
            ], dtype=np.float32)
        )
        midfield_x = self._detect_midfield_line_x(frame)
        if midfield_x is None:
            return 0.0, 100.0

        sample_y = float((self.pixel_vertices[0][1] + self.pixel_vertices[2][1]) / 2.0)
        pt = np.array([[[float(midfield_x), sample_y]]], dtype=np.float32)
        normalized = cv2.perspectiveTransform(pt, full_pitch_transform).reshape(-1, 2)[0]
        midfield_norm_x = float(normalized[0]) / 100.0

        if midfield_norm_x <= 0.05 or midfield_norm_x >= 0.95:
            return 0.0, 100.0

        # In a right-half broadcast view, the halfway line is visible and the right
        # touchline/end of the pitch is usually near the far-right green boundary.
        left = (50.0 - (midfield_norm_x * 100.0)) / (1.0 - midfield_norm_x)
        if 25.0 <= left <= 50.0:
            return float(left), 100.0

        right = 50.0 / midfield_norm_x
        if 50.0 <= right <= 80.0:
            return 0.0, float(right)

        return 0.0, 100.0

    def _detect_midfield_line_x(self, frame):
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        green = cv2.inRange(hsv, np.array([30, 30, 30]), np.array([95, 255, 255]))
        white = cv2.inRange(hsv, np.array([0, 0, 145]), np.array([180, 80, 255]))
        field_white = cv2.bitwise_and(
            white,
            cv2.dilate(green, np.ones((11, 11), np.uint8), iterations=1)
        )
        edges = cv2.Canny(field_white, 50, 150)
        lines = cv2.HoughLinesP(
            edges,
            1,
            np.pi / 180,
            threshold=70,
            minLineLength=max(90, int(self.frame_height * 0.18)),
            maxLineGap=25
        )
        if lines is None:
            return None

        candidates = []
        for line in lines[:, 0, :]:
            x1, y1, x2, y2 = [float(v) for v in line]
            dx = x2 - x1
            dy = y2 - y1
            length = (dx * dx + dy * dy) ** 0.5
            if length < self.frame_height * 0.18:
                continue
            angle = abs(np.degrees(np.arctan2(dy, dx)))
            if 72.0 <= angle <= 108.0:
                avg_x = (x1 + x2) / 2.0
                if self.frame_width * 0.12 <= avg_x <= self.frame_width * 0.45:
                    candidates.append((length, avg_x))

        if not candidates:
            return None

        return max(candidates, key=lambda item: item[0])[1]

    def _fallback_quad(self):
        w = float(self.frame_width)
        h = float(self.frame_height)
        return np.array([
            [0.05 * w, 0.25 * h],
            [0.95 * w, 0.25 * h],
            [0.98 * w, 0.93 * h],
            [0.02 * w, 0.93 * h]
        ], dtype=np.float32)

    def get_calibration_percentages(self):
        return [
            {"x": float((x / self.frame_width) * 100.0), "y": float((y / self.frame_height) * 100.0)}
            for x, y in self.pixel_vertices
        ]

    def get_visible_pitch_range(self):
        return {
            "xMin": float(self.visible_pitch_x_min),
            "xMax": float(self.visible_pitch_x_max),
            "yMin": 0.0,
            "yMax": 100.0
        }

    def transform_point(self, point):
        if point is None:
            return None
        
        pt = np.array(point, dtype=np.float32)
        if not np.all(np.isfinite(pt)) or pt.size < 2:
            return None

        reshaped_point = pt.reshape(-1, 1, 2)
        transformed_point = cv2.perspectiveTransform(reshaped_point, self.perspective_transformer)
        res = transformed_point.reshape(-1, 2)[0]

        # Bound cleanly to pitch boundaries
        px = max(2.0, min(98.0, float(res[0])))
        py = max(2.0, min(98.0, float(res[1])))
        return [px, py]

    def add_transformed_position_to_tracks(self, tracks):
        for obj, object_tracks in tracks.items():
            for frame_num, track in enumerate(object_tracks):
                for track_id, track_info in track.items():
                    position = track_info.get('position_adjusted') or track_info.get('position')
                    if position is not None:
                        position_transformed = self.transform_point(position)
                        tracks[obj][frame_num][track_id]['position_transformed'] = position_transformed
