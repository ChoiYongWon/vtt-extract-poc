import type { SubtitleListResponse, SubtitleMapping, VttOption } from "@vtt/types";
import { getServerEnv, hasExternalApiConfig } from "./env";
import { sampleVideos } from "./mock-data";
import { deriveMockSubtitleUrl } from "./aws";

function getHeaders() {
  const env = getServerEnv();
  return {
    "Content-Type": "application/json",
    ...(env.externalApiToken ? { Authorization: `Bearer ${env.externalApiToken}` } : {})
  };
}

function getBaseUrl() {
  const url = getServerEnv().externalApiUrl;
  if (!url) {
    throw new Error("EXTERNAL_API_URL is required");
  }

  return url.replace(/\/$/, "");
}

export async function fetchSubtitleMappings(): Promise<SubtitleMapping[]> {
  if (!hasExternalApiConfig()) {
    return [];
  }

  const response = await fetch(`${getBaseUrl()}/lectures/vtt`, {
    headers: getHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch subtitle mappings: ${response.status}`);
  }

  return (await response.json()) as SubtitleMapping[];
}

export async function persistSubtitleMapping(payload: {
  s3Key: string;
  vttS3Url: string;
}) {
  if (!hasExternalApiConfig()) {
    return {
      id: `mock-${payload.s3Key}`,
      lectureName: payload.s3Key.split("/").at(-1)?.replace(".mp4", "") ?? payload.s3Key,
      ...payload,
      mappingType: "auto" as const
    };
  }

  const response = await fetch(`${getBaseUrl()}/lectures/vtt`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to persist subtitle mapping: ${response.status}`);
  }

  return response.json();
}

export async function updateSubtitleMapping(id: string, payload: { s3Key?: string; vttS3Url: string }) {
  if (!hasExternalApiConfig()) {
    return { id, ...payload, updated: true };
  }

  const response = await fetch(`${getBaseUrl()}/lectures/vtt/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to update subtitle mapping: ${response.status}`);
  }

  return response.json();
}

export async function linkSubtitleMapping(payload: { s3Key: string; vttS3Url: string }) {
  if (!hasExternalApiConfig()) {
    return { linked: true, ...payload };
  }

  const response = await fetch(`${getBaseUrl()}/lectures/vtt/link`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to link subtitle mapping: ${response.status}`);
  }

  return response.json();
}

export async function getSubtitleListResponse(): Promise<SubtitleListResponse> {
  const items = await fetchSubtitleMappings();
  let options: VttOption[];

  if (!hasExternalApiConfig()) {
    options = sampleVideos.map((video) => ({
      key: deriveMockSubtitleUrl(video.s3Key).replace("s3://demo-bucket/", ""),
      label: video.title.replace(".mp4", ".vtt"),
      vttS3Url: deriveMockSubtitleUrl(video.s3Key)
    }));
  } else {
    options = items
      .filter((item) => item.vttS3Url)
      .map((item) => ({
        key: item.vttS3Url!.split("/").slice(3).join("/"),
        label: item.vttS3Url!.split("/").at(-1) ?? item.vttS3Url!,
        vttS3Url: item.vttS3Url!
      }));
  }

  return { items, options };
}
