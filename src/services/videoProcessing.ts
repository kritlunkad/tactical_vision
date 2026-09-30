import axios from 'axios';

// Use hardcoded URL for development, in production you'd use environment variables
const PYTHON_BACKEND_URL = 'http://localhost:8000';

export interface VideoProcessRequest {
  video_path: string;
  use_stubs?: boolean;
  use_cache?: boolean;
  batch_size?: number;
  device?: string;
}

export interface VideoUploadResponse {
  success: boolean;
  video_path: string;
  filename: string;
  public_url?: string;
}

export interface VideoItem {
  filename: string;
  path: string;
  size: number;
  public_url?: string;
}

export interface VideoListResponse {
  videos: VideoItem[];
}

export interface MatchDataResponse {
  id: string;
  name: string;
  sport: string;
  description: string;
  durationSec: number;
  fps: number;
  frames: any[];
  teamA: any;
  teamB: any;
  passingNetworkA: any;
  passingNetworkB: any;
  baseMetrics: any;
  dimension: any;
  videoPlaceholderTheme: string;
}

export class VideoProcessingService {
  async checkHealth(): Promise<any> {
    try {
      const response = await axios.get('/api/cv/health');
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  async listVideos(): Promise<VideoListResponse> {
    try {
      const response = await axios.get('/api/cv/videos');
      return response.data;
    } catch (error) {
      console.error('Failed to list videos:', error);
      throw error;
    }
  }

  async uploadVideo(file: File): Promise<VideoUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/cv/upload-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to upload video:', error);
      throw error;
    }
  }

  async processVideo(request: VideoProcessRequest): Promise<MatchDataResponse> {
    try {
      const response = await axios.post('/api/cv/process-video', request);
      return response.data;
    } catch (error: any) {
      const msg = error.response?.data?.details || error.response?.data?.error || error.message;
      console.error('Failed to process video:', msg);
      throw new Error(msg);
    }
  }

  async processUploadedVideo(videoPathOrFilename: string, useStubs: boolean = false): Promise<MatchDataResponse> {
    return this.processVideo({
      video_path: videoPathOrFilename,
      use_stubs: useStubs,
      use_cache: true,
      batch_size: 16,
      device: 'auto',
    });
  }
}

export const videoProcessingService = new VideoProcessingService();
