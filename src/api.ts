const API_BASE = "https://api.heygen.com";

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY environment variable is required");
  return key;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "X-Api-Key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HeyGen API ${method} ${path} failed (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<T>;
}

// --- Credits ---

interface CreditsResponse {
  error: string | null;
  data: {
    remaining_quota: number;
    details: Record<string, unknown>;
  };
}

export async function getCredits(): Promise<{ remaining: number; details: Record<string, unknown> }> {
  const resp = await request<CreditsResponse>("GET", "/v2/user/remaining_quota");
  const data: Record<string, unknown> = (resp.data as any) ?? (resp as any);
  const quota = (data.remaining_quota as number) || 0;
  const planCredit = (data.plan_credit as number) || 0;
  return {
    remaining: Math.max(quota, planCredit),
    details: (data.details as Record<string, unknown>) ?? data,
  };
}

// --- Voices ---

export interface Voice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio?: string;
  support_pause?: boolean;
  emotion_support?: boolean;
}

interface VoicesResponse {
  error: string | null;
  data: { voices: Voice[] };
}

export async function listVoices(): Promise<Voice[]> {
  const resp = await request<VoicesResponse>("GET", "/v2/voices");
  return resp.data?.voices ?? [];
}

// --- Avatars ---

export interface Avatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url: string;
  preview_video_url: string;
  type: string;
  tags?: string[];
  default_voice_id?: string;
}

export interface TalkingPhoto {
  talking_photo_id: string;
  talking_photo_name: string;
  preview_image_url: string;
}

interface AvatarsResponse {
  error: string | null;
  data: {
    avatars: Avatar[];
    talking_photos: TalkingPhoto[];
  };
}

export async function listAvatars(): Promise<{ avatars: Avatar[]; talking_photos: TalkingPhoto[] }> {
  const resp = await request<AvatarsResponse>("GET", "/v2/avatars");
  return {
    avatars: resp.data?.avatars ?? [],
    talking_photos: resp.data?.talking_photos ?? [],
  };
}

// --- Video Generation ---

export interface VideoScene {
  character: {
    type: "avatar" | "talking_photo";
    avatar_id?: string;
    talking_photo_id?: string;
    avatar_style?: "normal" | "circle" | "closeUp";
    scale?: number;
  };
  voice: {
    type: "text" | "audio" | "silence";
    voice_id?: string;
    input_text?: string;
    input_audio?: string;
    speed?: number;
    pitch?: number;
    emotion?: string;
    duration?: number;
  };
  background?: {
    type: "color" | "image" | "video";
    value?: string;
    url?: string;
  };
}

interface GenerateResponse {
  error: string | null;
  data: { video_id: string };
}

export async function generateVideo(opts: {
  scenes: VideoScene[];
  title?: string;
  caption?: boolean;
  dimension?: { width: number; height: number };
  callback_url?: string;
}): Promise<string> {
  const resp = await request<GenerateResponse>("POST", "/v2/video/generate", {
    video_inputs: opts.scenes,
    title: opts.title,
    caption: opts.caption,
    dimension: opts.dimension,
    callback_url: opts.callback_url,
  });
  return resp.data.video_id;
}

// --- Video Status ---

export interface VideoStatus {
  id: string;
  status: "pending" | "waiting" | "processing" | "completed" | "failed";
  video_url: string | null;
  thumbnail_url: string | null;
  gif_url: string | null;
  caption_url: string | null;
  duration: number | null;
  created_at: number;
  error: string | null;
}

interface StatusResponse {
  code: number;
  data: VideoStatus;
  message: string;
}

export async function getVideoStatus(videoId: string): Promise<VideoStatus> {
  const resp = await request<StatusResponse>("GET", `/v1/video_status.get?video_id=${videoId}`);
  return resp.data;
}
