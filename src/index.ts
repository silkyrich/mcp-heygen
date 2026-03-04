#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  getCredits,
  listVoices,
  listAvatars,
  uploadTalkingPhoto,
  generateVideo,
  getVideoStatus,
  type Voice,
  type Avatar,
  type VideoScene,
} from "./api.js";

const server = new McpServer({
  name: "heygen",
  version: "1.0.0",
});

function getOutputDir(): string {
  return process.env.HEYGEN_OUTPUT_DIR || join(homedir(), "Downloads", "heygen");
}

// --- Tool 1: get_remaining_credits ---

server.tool(
  "get_remaining_credits",
  "Check remaining HeyGen API credits. Use this before generating videos to confirm budget.",
  {},
  async () => {
    try {
      const { remaining, api, plan, details } = await getCredits();
      return {
        content: [{
          type: "text" as const,
          text: `HeyGen credits:\n- **API credits**: ${api} (used for API video generation)\n- **Plan credits**: ${plan} (web dashboard only)\n- **Remaining quota**: ${remaining}\n\nDetails:\n${JSON.stringify(details, null, 2)}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 2: get_voices ---

server.tool(
  "get_voices",
  "List available HeyGen voices. Filter by language or gender to find suitable voices for educational content. Returns voice_id needed for video generation.",
  {
    language: z.string().optional().describe("Filter by language (e.g. 'English', 'Spanish')"),
    gender: z.string().optional().describe("Filter by gender ('male' or 'female')"),
  },
  async ({ language, gender }) => {
    try {
      let voices = await listVoices();

      if (language) {
        const lang = language.toLowerCase();
        voices = voices.filter((v) => v.language?.toLowerCase().includes(lang));
      }
      if (gender) {
        const gen = gender.toLowerCase();
        voices = voices.filter((v) => v.gender?.toLowerCase() === gen);
      }

      if (voices.length === 0) {
        return { content: [{ type: "text" as const, text: "No voices match your filters." }] };
      }

      const formatted = voices.slice(0, 30).map((v) =>
        `- **${v.name}** (${v.voice_id}) — ${v.language}, ${v.gender}${v.emotion_support ? ", supports emotion" : ""}${v.preview_audio ? `\n  Preview: ${v.preview_audio}` : ""}`
      ).join("\n");

      return {
        content: [{
          type: "text" as const,
          text: `Found ${voices.length} voices${voices.length > 30 ? " (showing first 30)" : ""}:\n\n${formatted}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 3: get_avatars ---

server.tool(
  "get_avatars",
  "List available HeyGen avatars and talking photos. Returns avatar_id needed for video generation. Includes preview images.",
  {
    include_talking_photos: z.boolean().optional().describe("Include talking photos in results (default true)"),
  },
  async ({ include_talking_photos }) => {
    try {
      const { avatars, talking_photos } = await listAvatars();
      const showPhotos = include_talking_photos !== false;

      const parts: string[] = [];

      if (avatars.length > 0) {
        const avatarLines = avatars.slice(0, 20).map((a) =>
          `- **${a.avatar_name}** (\`${a.avatar_id}\`) — ${a.gender}, ${a.type}${a.tags?.length ? ` [${a.tags.join(", ")}]` : ""}${a.default_voice_id ? `\n  Default voice: ${a.default_voice_id}` : ""}\n  Preview: ${a.preview_image_url}`
        ).join("\n");
        parts.push(`### Avatars (${avatars.length}${avatars.length > 20 ? ", showing 20" : ""})\n\n${avatarLines}`);
      }

      if (showPhotos && talking_photos.length > 0) {
        const photoLines = talking_photos.slice(0, 10).map((p) =>
          `- **${p.talking_photo_name}** (\`${p.talking_photo_id}\`)\n  Preview: ${p.preview_image_url}`
        ).join("\n");
        parts.push(`### Talking Photos (${talking_photos.length}${talking_photos.length > 10 ? ", showing 10" : ""})\n\n${photoLines}`);
      }

      return {
        content: [{ type: "text" as const, text: parts.join("\n\n") || "No avatars found." }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 4: upload_talking_photo ---

server.tool(
  "upload_talking_photo",
  "Upload a local image as a HeyGen talking photo avatar. The image should be a clear, front-facing portrait. Returns a talking_photo_id that can be used with generate_avatar_video (set avatar_type to 'talking_photo').",
  {
    image_path: z.string().describe("Absolute path to the image file (PNG or JPEG)"),
  },
  async ({ image_path }) => {
    try {
      const buffer = await readFile(image_path);
      const ext = image_path.toLowerCase();
      const mimeType = ext.endsWith(".png") ? "image/png" : "image/jpeg";

      const { talking_photo_id, talking_photo_url } = await uploadTalkingPhoto(buffer, mimeType);

      return {
        content: [{
          type: "text" as const,
          text: `Talking photo uploaded successfully.\n\n- **Talking Photo ID**: \`${talking_photo_id}\`\n- **Preview URL**: ${talking_photo_url}\n\nUse this ID with \`generate_avatar_video\` (set \`avatar_type\` to \`"talking_photo"\`) to create a video.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 5: generate_avatar_video ---

server.tool(
  "generate_avatar_video",
  "Generate a talking head video using a HeyGen avatar. Provide the script text and the avatar/voice IDs (from get_avatars and get_voices). Returns a video_id for status polling. Supports multiple scenes, custom backgrounds, and captions.",
  {
    avatar_id: z.string().describe("Avatar ID from get_avatars (e.g. 'Angela-inblackskirt-20220820')"),
    avatar_type: z.enum(["avatar", "talking_photo"]).optional().describe("Avatar type (default 'avatar')"),
    voice_id: z.string().describe("Voice ID from get_voices"),
    input_text: z.string().max(5000).describe("Script text for the avatar to speak (max 5000 chars)"),
    title: z.string().optional().describe("Video title for tracking"),
    speed: z.number().min(0.5).max(2.0).optional().describe("Voice speed (0.5-2.0, default 1.0)"),
    caption: z.boolean().optional().describe("Enable captions/subtitles"),
    background_color: z.string().optional().describe("Background hex colour (e.g. '#FFFFFF')"),
    background_image_url: z.string().optional().describe("Background image URL"),
    width: z.number().optional().describe("Video width in pixels (default 1280)"),
    height: z.number().optional().describe("Video height in pixels (default 720)"),
  },
  async (params) => {
    try {
      const scene: VideoScene = {
        character: {
          type: params.avatar_type || "avatar",
          ...(params.avatar_type === "talking_photo"
            ? { talking_photo_id: params.avatar_id }
            : { avatar_id: params.avatar_id }),
        },
        voice: {
          type: "text",
          voice_id: params.voice_id,
          input_text: params.input_text,
          speed: params.speed,
        },
      };

      if (params.background_color) {
        scene.background = { type: "color", value: params.background_color };
      } else if (params.background_image_url) {
        scene.background = { type: "image", url: params.background_image_url };
      }

      const videoId = await generateVideo({
        scenes: [scene],
        title: params.title,
        caption: params.caption,
        dimension: (params.width && params.height)
          ? { width: params.width, height: params.height }
          : undefined,
      });

      return {
        content: [{
          type: "text" as const,
          text: `Video generation started.\n\n- **Video ID**: \`${videoId}\`\n- **Title**: ${params.title || "(untitled)"}\n- **Script**: ${params.input_text.slice(0, 100)}${params.input_text.length > 100 ? "..." : ""}\n\nUse \`get_avatar_video_status\` with this video_id to check progress and get the download URL.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 5: get_avatar_video_status ---

server.tool(
  "get_avatar_video_status",
  "Check the status of a HeyGen video generation job. Returns status (pending/processing/completed/failed) and download URL when complete. Can optionally download the video to the output directory.",
  {
    video_id: z.string().describe("Video ID from generate_avatar_video"),
    download: z.boolean().optional().describe("Download the video when complete (default false)"),
    filename: z.string().optional().describe("Custom filename for download (without extension)"),
  },
  async (params) => {
    try {
      const status = await getVideoStatus(params.video_id);

      const lines = [
        `**Status**: ${status.status}`,
        `**Video ID**: ${status.id}`,
        status.duration ? `**Duration**: ${status.duration.toFixed(1)}s` : null,
        status.error ? `**Error**: ${status.error}` : null,
        status.video_url ? `**Video URL**: ${status.video_url} (expires in 7 days)` : null,
        status.thumbnail_url ? `**Thumbnail**: ${status.thumbnail_url}` : null,
      ].filter(Boolean);

      // Download if requested and complete
      if (params.download && status.status === "completed" && status.video_url) {
        const outputDir = getOutputDir();
        await mkdir(outputDir, { recursive: true });

        const name = params.filename || `heygen_${params.video_id}`;
        const filePath = join(outputDir, `${name}.mp4`);

        const resp = await fetch(status.video_url);
        if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);

        const buffer = Buffer.from(await resp.arrayBuffer());
        await writeFile(filePath, buffer);

        lines.push(`\n**Downloaded**: ${filePath}`);
      } else if (params.download && status.status !== "completed") {
        lines.push(`\n(Download requested but video is not yet complete — check again later)`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("heygen MCP server running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
