import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPCM } from "./ffmpeg.js";

type VadModule = typeof import("@ricky0123/vad-node");

export async function detectFirstSpeech(inputPath: string) {
  const pcmPath = join(tmpdir(), `vad-${Date.now()}-${Math.random().toString(16).slice(2)}.f32`);

  try {
    await extractPCM(inputPath, pcmPath);
    const buffer = readFileSync(pcmPath);
    const audio = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));

    if (audio.length === 0) {
      console.log("[worker] VAD produced empty PCM buffer");
      return 0;
    }

    const { NonRealTimeVAD } = (await import("@ricky0123/vad-node")) as VadModule;
    const vad = await NonRealTimeVAD.new({
      positiveSpeechThreshold: 0.8,
      negativeSpeechThreshold: 0.6,
      minSpeechFrames: 6,
      preSpeechPadFrames: 0
    });

    for await (const segment of vad.run(audio, 16000)) {
      if (segment.start >= 0) {
        const firstSpeech = segment.start / 1000;
        console.log("[worker] VAD detected first speech", {
          firstSpeech,
          sampleRate: 16000,
          samples: audio.length
        });
        return firstSpeech;
      }
    }

    console.log("[worker] VAD found no speech segment");
    return 0;
  } catch (error) {
    console.warn("[worker] VAD detection failed, falling back to 0", error);
    return 0;
  } finally {
    if (existsSync(pcmPath)) {
      unlinkSync(pcmPath);
    }
  }
}
