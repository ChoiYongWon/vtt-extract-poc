import { NextResponse } from "next/server";
import type { Segment } from "@vtt/types";
import { segmentsToVtt, uploadVttToS3 } from "../../../../lib/aws";
import { updateSubtitleMapping } from "../../../../lib/external-api";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => ({}));
  const segments = Array.isArray(body.segments) ? (body.segments as Segment[]) : [];
  const vttS3Url = typeof body.vttS3Url === "string" ? body.vttS3Url : "";
  const s3Key = typeof body.s3Key === "string" ? body.s3Key : undefined;

  if (!vttS3Url || segments.length === 0) {
    return NextResponse.json({ message: "vttS3Url and segments are required" }, { status: 400 });
  }

  try {
    const vttBody = segmentsToVtt(segments);
    const uploadedVttS3Url = process.env.AWS_S3_BUCKET ? await uploadVttToS3(vttS3Url, vttBody) : vttS3Url;
    const updated = await updateSubtitleMapping(params.id, {
      s3Key,
      vttS3Url: uploadedVttS3Url
    });

    return NextResponse.json({
      id: params.id,
      saved: true,
      mapping: updated,
      vttS3Url: uploadedVttS3Url
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save subtitles";
    return NextResponse.json({ message }, { status: 500 });
  }
}
