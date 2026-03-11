import { NextResponse } from "next/server";
import { getVideos } from "../../../lib/data";
import { hasAwsVideoConfig } from "../../../lib/env";

export async function GET() {
  try {
    const items = await getVideos();
    return NextResponse.json({
      items,
      source: hasAwsVideoConfig() ? "s3" : "mock"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load videos";
    return NextResponse.json({ message }, { status: 500 });
  }
}
