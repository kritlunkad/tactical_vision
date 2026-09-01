import argparse
import os

from utils import read_video, save_video
from trackers import Tracker
import cv2
import numpy as np
from team_assigner import TeamAssigner
from player_ball_assigner import PlayerBallAssigner
from camera_movement_estimator import CameraMovementEstimator
from view_transformer import ViewTransformer
from speed_and_distance_estimator import SpeedAndDistance_Estimator


def parse_args():
    parser = argparse.ArgumentParser(description='Track football players and ball in a video.')
    parser.add_argument('--input', default='input_videos/08fd33_4.mp4', help='Input video path.')
    parser.add_argument('--model', default='models/best.pt', help='YOLO model path.')
    parser.add_argument('--output', default='output_videos/output_video.avi', help='Output video path.')
    parser.add_argument('--track-stub', default='stubs/track_stubs.pkl', help='Track cache path.')
    parser.add_argument('--camera-stub', default='stubs/camera_movement_stub.pkl', help='Camera movement cache path.')
    parser.add_argument('--no-stubs', action='store_true', help='Recompute detections and camera movement.')
    parser.add_argument('--device', default='auto', choices=['auto', 'mps', 'cpu'], help='Inference device.')
    parser.add_argument('--batch-size', type=int, default=32, help='Frames per YOLO inference batch.')
    return parser.parse_args()


def tracks_fit_frame(tracks, frame):
    frame_height, frame_width = frame.shape[:2]
    for object_tracks in tracks.values():
        for frame_tracks in object_tracks:
            for track_info in frame_tracks.values():
                _, _, x2, y2 = track_info['bbox']
                if x2 > frame_width * 1.1 or y2 > frame_height * 1.1:
                    return False
    return True


def main():
    args = parse_args()
    if args.batch_size < 1:
        raise ValueError('--batch-size must be at least 1.')

    for path, description in ((args.input, 'Input video'), (args.model, 'YOLO model')):
        if not os.path.isfile(path):
            raise FileNotFoundError(f'{description} not found: {path}')

    # Read Video
    video_frames = read_video(args.input)
    if not video_frames:
        raise RuntimeError(f'Could not read any frames from input video: {args.input}')

    # Initialize Tracker
    tracker = Tracker(args.model, batch_size=args.batch_size, device=args.device)

    use_stubs = not args.no_stubs
    tracks = tracker.get_object_tracks(video_frames,
                                       read_from_stub=use_stubs,
                                       stub_path=args.track_stub)
    if use_stubs and not tracks_fit_frame(tracks, video_frames[0]):
        use_stubs = False
        tracks = tracker.get_object_tracks(video_frames,
                                           read_from_stub=False,
                                           stub_path=args.track_stub)
    # Get object positions 
    tracker.add_position_to_tracks(tracks)

    # camera movement estimator
    camera_movement_estimator = CameraMovementEstimator(video_frames[0])
    camera_movement_per_frame = camera_movement_estimator.get_camera_movement(video_frames,
                                                                                read_from_stub=use_stubs,
                                                                                stub_path=args.camera_stub)
    camera_movement_estimator.add_adjust_positions_to_tracks(tracks,camera_movement_per_frame)


    # View Trasnformer
    view_transformer = ViewTransformer()
    view_transformer.add_transformed_position_to_tracks(tracks)

    # Interpolate Ball Positions
    tracks["ball"] = tracker.interpolate_ball_positions(tracks["ball"])

    # Speed and distance estimator
    speed_and_distance_estimator = SpeedAndDistance_Estimator()
    speed_and_distance_estimator.add_speed_and_distance_to_tracks(tracks)

    # Assign Player Teams
    team_assigner = TeamAssigner()
    if not tracks['players'][0]:
        raise RuntimeError('No players were detected in the first frame.')
    team_assigner.assign_team_color(video_frames[0], tracks['players'][0])
    
    for frame_num, player_track in enumerate(tracks['players']):
        for player_id, track in player_track.items():
            team = team_assigner.get_player_team(video_frames[frame_num],   
                                                 track['bbox'],
                                                 player_id)
            tracks['players'][frame_num][player_id]['team'] = team 
            tracks['players'][frame_num][player_id]['team_color'] = team_assigner.team_colors[team]

    
    # Assign Ball Aquisition
    player_assigner =PlayerBallAssigner()
    team_ball_control= []
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
    team_ball_control= np.array(team_ball_control)


    # Draw output 
    ## Draw object Tracks
    output_video_frames = tracker.draw_annotations(video_frames, tracks,team_ball_control)

    ## Draw Camera movement
    output_video_frames = camera_movement_estimator.draw_camera_movement(output_video_frames,camera_movement_per_frame)

    ## Draw Speed and Distance
    speed_and_distance_estimator.draw_speed_and_distance(output_video_frames,tracks)

    # Save video
    save_video(output_video_frames, args.output)

if __name__ == '__main__':
    main()