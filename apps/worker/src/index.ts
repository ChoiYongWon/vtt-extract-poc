import { existsSync, unlinkSync } from "node:fs";
import { toMp3 } from "./ffmpeg.js";
import { toVtt } from "./format.js";
import { downloadFromS3, uploadToS3 } from "./s3.js";
import { transcribe } from "./transcribe.js";
import { detectFirstSpeech } from "./vad.js";

function applyVadOffset(
  segments: Array<{ start: number; end: number; text: string }>,
  vadOffset: number
) {
  if (!segments.length || vadOffset <= 0) {
    return segments;
  }

  if (segments[0].start >= vadOffset) {
    return segments;
  }

  const nextSegments = segments.slice();
  nextSegments[0] = { ...segments[0], start: vadOffset };
  return nextSegments;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function maskSecret(value: string) {
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

async function main() {
  const jobId = getRequiredEnv("JOB_ID");
  const s3Key = getRequiredEnv("S3_KEY");
  const bucket = getRequiredEnv("S3_BUCKET");
  const awsRegion = getRequiredEnv("AWS_REGION");
  const openAiApiKey = getRequiredEnv("OPENAI_API_KEY");
  const mp4Path = `/tmp/${jobId}.mp4`;
  const mp3Path = `/tmp/${jobId}.mp3`;
  const keyParts = s3Key.split("/");
  const lectureName = (keyParts.at(-1) ?? s3Key).replace(/\.[^.]+$/, "");
  const dir = keyParts.slice(0, -1).join("/");
  const vttS3Key = dir ? `${dir}/${lectureName}.vtt` : `${lectureName}.vtt`;

  try {
    console.log("[worker] runtime config loaded", {
      jobId,
      s3Key,
      bucket,
      awsRegion,
      mp4Path,
      mp3Path,
      vttS3Key,
      openAiApiKeyMasked: maskSecret(openAiApiKey)
    });
    console.log("[worker] downloading video from S3", { bucket, s3Key });
    await downloadFromS3(bucket, s3Key, mp4Path);

    console.log("[worker] converting MP4 to MP3", { mp4Path, mp3Path });
    await toMp3(mp4Path, mp3Path);

    const firstSpeech = await detectFirstSpeech(mp4Path);
    console.log("[worker] VAD offset resolved", { firstSpeech });

    console.log("[worker] transcribing audio with Whisper");
    const { segments: rawSegments } = await transcribe(mp3Path);
    console.log("[worker] Whisper first segment before VAD adjust", {
      start: rawSegments[0]?.start ?? null,
      end: rawSegments[0]?.end ?? null,
      text: rawSegments[0]?.text?.slice(0, 60) ?? null
    });

    const segments = applyVadOffset(rawSegments, firstSpeech);
    console.log("[worker] Whisper first segment after VAD adjust", {
      start: segments[0]?.start ?? null,
      end: segments[0]?.end ?? null,
      adjusted: rawSegments[0]?.start !== segments[0]?.start,
      firstSpeech
    });

    const vtt = toVtt(segments);
    console.log("[worker] uploading generated VTT", { vttS3Key });
    await uploadToS3(bucket, vttS3Key, vtt);
    console.log("[worker] completed", {
      jobId,
      s3Key,
      vttS3Url: `s3://${bucket}/${vttS3Key}`,
      segments: segments.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    console.error("[worker] failed:", message);
    process.exitCode = 1;
  } finally {
    [mp4Path, mp3Path].forEach((file) => {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    });
  }
}

void main();
