import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { JobMeta } from "@vtt/types";
import { runTranscribeTask } from "../../../lib/aws";
import { hasEcsConfig } from "../../../lib/env";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const s3Key = typeof body.s3Key === "string" ? body.s3Key : "";

  if (!s3Key) {
    return NextResponse.json({ message: "s3Key is required" }, { status: 400 });
  }

  const jobId = randomUUID();
  const job: JobMeta = {
    jobId,
    s3Key,
    createdAt: new Date().toISOString(),
    source: hasEcsConfig() ? "ecs" : "mock"
  };

  try {
    if (job.source === "ecs") {
      await runTranscribeTask(job);
      return NextResponse.json({
        jobId,
        state: "started",
        note: "ECS task started. Refresh the list to see the generated VTT."
      });
    }

    return NextResponse.json({
      jobId,
      state: "mock",
      note: "ECS configuration is incomplete. Mock mode is active."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start transcription task";
    return NextResponse.json({ message }, { status: 500 });
  }
}
