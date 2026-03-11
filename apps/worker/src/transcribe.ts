import { createReadStream } from "node:fs";
import type { Segment } from "@vtt/types";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

type WhisperVerboseResponse = {
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
};

export async function transcribe(audioPath: string): Promise<{ segments: Segment[] }> {
  const response = (await client.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json"
  })) as WhisperVerboseResponse;

  const segments =
    response.segments?.map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text
    })) ?? [];

  return { segments };
}

