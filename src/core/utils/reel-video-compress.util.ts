import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import root from "app-root-path";

const execFileAsync = promisify(execFile);

function getFfmpegBinary(): string {
  if (process.env.FFMPEG_PATH?.trim()) {
    return process.env.FFMPEG_PATH.trim();
  }
  return process.platform === "win32" ? "ffmpeg" : "/usr/bin/ffmpeg";
}

/**
 * H.264 + AAC MP4 tuned for short vertical reels: capped resolution, CRF, faststart for streaming.
 * Uses execFile (no shell) for safer paths.
 */
export async function compressReelVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  if (process.env.SKIP_REEL_VIDEO_COMPRESS === "1") {
    throw new Error("SKIP_REEL_VIDEO_COMPRESS");
  }

  const ffmpeg = getFfmpegBinary();
  // Commas inside min() must be escaped or FFmpeg treats them as filter-chain separators.
  const vf =
    "scale=min(1080\\,iw):min(1920\\,ih):force_original_aspect_ratio=decrease,format=yuv420p";

  const withAudio = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "26",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-y",
    outputPath,
  ];

  try {
    await execFileAsync(ffmpeg, withAudio, {
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return;
  } catch {
    const videoOnly = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "26",
      "-movflags",
      "+faststart",
      "-an",
      "-y",
      outputPath,
    ];
    await execFileAsync(ffmpeg, videoOnly, {
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  }
}

export function getReelTempDir(): string {
  return path.join(root.path, "temp");
}
