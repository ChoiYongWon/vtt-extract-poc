import { NextResponse } from "next/server";
import { getSubtitleData } from "../../../lib/data";

export async function GET() {
  try {
    return NextResponse.json(await getSubtitleData());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load subtitles";
    return NextResponse.json({ message }, { status: 500 });
  }
}
