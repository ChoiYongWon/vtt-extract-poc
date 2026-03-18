import type { FolderEntry, SubtitleListResponse, VideoFolderData, VideoItem } from "@vtt/types";
import { listFolderFromS3, listSubtitleOptionsFromS3, listVideosFromS3 } from "./aws";
import { hasAwsVideoConfig } from "./env";
import { fetchSubtitleMappings, getSubtitleListResponse } from "./external-api";
import { sampleMappings, sampleVideos } from "./mock-data";

function getMockFolderContents(prefix: string): VideoFolderData {
  // Collect direct children under `prefix`
  const subFolderSet = new Set<string>();
  const items: VideoItem[] = [];

  for (const video of sampleVideos) {
    if (!video.s3Key.startsWith(prefix)) continue;
    const rest = video.s3Key.slice(prefix.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) {
      items.push(video);
    } else {
      subFolderSet.add(rest.slice(0, slashIdx));
    }
  }

  const folders: FolderEntry[] = Array.from(subFolderSet).map((name) => ({
    prefix: `${prefix}${name}/`,
    name
  }));

  return { items, folders };
}

export async function getFolderContents(prefix: string): Promise<VideoFolderData> {
  if (!hasAwsVideoConfig()) {
    try {
      const mappings = await fetchSubtitleMappings();
      const mappingByS3Key = new Map(mappings.map((item) => [item.s3Key, item]));
      const { items, folders } = getMockFolderContents(prefix);
      return {
        items: items.map((video) => {
          const mapping = mappingByS3Key.get(video.s3Key);
          return {
            ...video,
            vttS3Url: mapping?.vttS3Url ?? video.vttS3Url,
            subtitleId: mapping?.id ?? video.subtitleId,
            mappingType: mapping?.mappingType ?? video.mappingType
          };
        }),
        folders
      };
    } catch {
      return getMockFolderContents(prefix);
    }
  }

  try {
    const mappings = await fetchSubtitleMappings().catch(() => []);
    const mappingByS3Key = new Map(mappings.map((item) => [item.s3Key, item]));
    return await listFolderFromS3(prefix, mappingByS3Key);
  } catch {
    return getMockFolderContents(prefix);
  }
}

export async function getVideos(): Promise<VideoItem[]> {
  try {
    if (!hasAwsVideoConfig()) {
      const mappings = await fetchSubtitleMappings();
      const mappingByS3Key = new Map(mappings.map((item) => [item.s3Key, item]));
      return sampleVideos.map((video) => {
        const mapping = mappingByS3Key.get(video.s3Key);
        return {
          ...video,
          vttS3Url: mapping?.vttS3Url ?? video.vttS3Url,
          subtitleId: mapping?.id,
          mappingType: mapping?.mappingType ?? video.mappingType
        };
      });
    }

    const mappings = await fetchSubtitleMappings().catch(() => []);
    const mappingByS3Key = new Map(mappings.map((item) => [item.s3Key, item]));
    return await listVideosFromS3(mappingByS3Key);
  } catch {
    return sampleVideos;
  }
}

export async function getSubtitleData(): Promise<SubtitleListResponse> {
  if (!hasAwsVideoConfig()) {
    try {
      return await getSubtitleListResponse();
    } catch {
      return {
        items: sampleMappings,
        options: sampleVideos
          .filter((video) => video.vttS3Url)
          .map((video) => ({
            key: video.vttS3Url!.replace("s3://demo-bucket/", ""),
            label: video.title.replace(".mp4", ".vtt"),
            vttS3Url: video.vttS3Url!
          }))
      };
    }
  }

  const items = await fetchSubtitleMappings().catch(() => []);
  try {
    const options = await listSubtitleOptionsFromS3();
    return { items, options };
  } catch {
    return {
      items,
      options: []
    };
  }
}
