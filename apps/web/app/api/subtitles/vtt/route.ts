import { NextResponse } from "next/server";
import { readVttFromS3 } from "../../../../lib/aws";
import { parseVtt } from "../../../../lib/vtt";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ message: "url is required" }, { status: 400 });
  }

  try {
    const vttContent = await readVttFromS3(url);
    const segments = parseVtt(vttContent);
    return NextResponse.json({ segments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load VTT";
    return NextResponse.json({ message }, { status: 500 });
  }
}
