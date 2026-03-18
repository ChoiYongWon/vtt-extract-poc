import { NextResponse } from "next/server";
import { getFolderContents } from "../../../lib/data";
import { hasAwsVideoConfig } from "../../../lib/env";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prefix = searchParams.get("prefix") ?? "videos/";

  try {
    const data = await getFolderContents(prefix);
    return NextResponse.json({
      ...data,
      source: hasAwsVideoConfig() ? "s3" : "mock"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load folder";
    return NextResponse.json({ message }, { status: 500 });
  }
}
