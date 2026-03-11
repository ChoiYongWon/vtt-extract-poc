import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { jobId: string } }
) {
  return NextResponse.json({
    jobId: params.jobId,
    state: "deferred",
    note: "Redis-backed live status streaming is deferred. Refresh the video list to pick up finished VTT files from S3."
  });
}
