# mcp-heygen

An MCP server for generating talking head videos via the [HeyGen API](https://docs.heygen.com). Built for automated lesson generation — Claude writes the script, HeyGen renders the avatar.

Replaces the abandoned [heygen-mcp](https://github.com/heygen-com/heygen-mcp) PyPI package (last updated April 2025, multiple broken endpoints).

## Tools

### `get_remaining_credits`
Check API credit balance before generating.

### `get_voices`
List available voices with optional language/gender filtering. Returns `voice_id` needed for generation.

### `get_avatars`
List available avatars and talking photos. Returns `avatar_id` needed for generation. Includes preview image URLs.

### `upload_talking_photo`
Upload a local portrait image as a HeyGen talking photo avatar. Returns a `talking_photo_id` for use with `generate_avatar_video`. Image should be a clear, front-facing portrait (PNG or JPEG).

### `generate_avatar_video`
Generate a talking head video from script text. Supports:
- Avatar or talking photo characters
- Voice speed/pitch control
- Solid colour or image backgrounds
- Captions/subtitles
- Custom dimensions (720p default, up to 4K)

Returns a `video_id` for status polling.

### `get_avatar_video_status`
Poll video generation progress. When complete, returns the video URL (expires in 7 days). Optionally downloads the video to the output directory.

### `delete_video`
Delete a video generation job. Use to cancel stuck/processing videos or clean up completed ones.

## Setup

### Build

```bash
npm install
npm run build
```

### Register with Claude Code

Add to `~/.claude.json` under `mcpServers`:

```json
"heygen": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/mcp-heygen/dist/index.js"],
  "env": {
    "HEYGEN_API_KEY": "your-api-key",
    "HEYGEN_OUTPUT_DIR": "/path/to/output/directory"
  }
}
```

### Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `HEYGEN_API_KEY` | **Yes** | — |
| `HEYGEN_OUTPUT_DIR` | No | `~/Downloads/heygen` |

## Typical Workflow

```
# Using a stock avatar:
1. get_voices(language: "English", gender: "female")  → pick a voice_id
2. get_avatars()                                       → pick an avatar_id
3. generate_avatar_video(avatar_id, voice_id, text)    → get video_id
4. get_avatar_video_status(video_id)                   → poll until completed
5. get_avatar_video_status(video_id, download: true)   → save to output dir

# Using your own photo:
1. upload_talking_photo(image_path)                     → get talking_photo_id
2. get_voices(language: "English", gender: "female")    → pick a voice_id
3. generate_avatar_video(talking_photo_id, voice_id, text, avatar_type: "talking_photo")
4. get_avatar_video_status(video_id)                    → poll until completed
5. get_avatar_video_status(video_id, download: true)    → save to output dir
```

## API Costs (as of 2026)

| Feature | Cost |
|---------|------|
| Public Avatar (Engine III) | $0.0167/sec (~$1/min) |
| Public Avatar (Engine IV) | $0.10/sec (~$6/min) |
| Photo Avatar (Engine III) | $0.0167/sec (~$1/min) |

HeyGen API credits are separate from subscription credits. Check `get_remaining_credits` before generating.

## Licence

MIT
