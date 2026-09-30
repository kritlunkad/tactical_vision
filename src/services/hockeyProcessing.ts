import axios from 'axios';

/**
 * Hockey Video Processing Service - COMPLETELY SEPARATE FROM FOOTBALL
 * Uses /api/hockey/* endpoints backed by HockeyAI_model_weight.pt (7 classes)
 * Football service (videoProcessing.ts) remains untouched on /api/cv/*
 */

export interface HockeyVideoProcessRequest {
  video_path: string;
  use_stubs?: boolean;
  use_cache?: boolean;
  batch_size?: number;
  device?: string;
}

export interface HockeyVideoUploadResponse {
  success: boolean;
  video_path: string;
  filename: string;
  public_url?: string;
}

export interface HockeyVideoItem {
  filename: string;
  path: string;
  size: number;
  public_url?: string;
  is_hockey?: boolean;
}

export interface HockeyVideoListResponse {
  videos: HockeyVideoItem[];
}

export interface HockeyMatchDataResponse {
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

export class HockeyProcessingService {
  async checkHealth(): Promise<any> {
    try {
      const response = await axios.get('/api/hockey/health');
      return response.data;
    } catch (error) {
      console.error('Hockey health check failed:', error);
      throw error;
    }
  }

  async listVideos(): Promise<HockeyVideoListResponse> {
    try {
      const response = await axios.get('/api/hockey/videos');
      return response.data;
    } catch (error) {
      console.error('Failed to list hockey videos:', error);
      throw error;
    }
  }

  async uploadVideo(file: File): Promise<HockeyVideoUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/hockey/upload-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to upload hockey video:', error);
      throw error;
    }
  }

  async processVideo(request: HockeyVideoProcessRequest): Promise<HockeyMatchDataResponse> {
    try {
      const response = await axios.post('/api/hockey/process-video', request);
      return response.data;
    } catch (error: any) {
      const msg = error.response?.data?.details || error.response?.data?.error || error.message;
      console.error('Failed to process hockey video:', msg);
      throw new Error(msg);
    }
  }

  async processUploadedVideo(videoPathOrFilename: string, useStubs: boolean = false): Promise<HockeyMatchDataResponse> {
    return this.processVideo({
      video_path: videoPathOrFilename,
      use_stubs: useStubs,
      use_cache: true,
      batch_size: 16,
      device: 'auto',
    });
  }
}

export const hockeyProcessingService = new HockeyProcessingService();
