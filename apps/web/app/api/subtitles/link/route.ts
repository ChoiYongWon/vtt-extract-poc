import { NextResponse } from "next/server";
import { linkSubtitleMapping } from "../../../../lib/external-api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const s3Key = typeof body.s3Key === "string" ? body.s3Key : "";
  const vttS3Url = typeof body.vttS3Url === "string" ? body.vttS3Url : "";

  if (!s3Key || !vttS3Url) {
    return NextResponse.json({ message: "s3Key and vttS3Url are required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await linkSubtitleMapping({ s3Key, vttS3Url }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to link subtitles";
    return NextResponse.json({ message }, { status: 500 });
  }
}
