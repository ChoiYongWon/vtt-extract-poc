import type { SubtitleListResponse, VideoItem } from "@vtt/types";
import { listSubtitleOptionsFromS3, listVideosFromS3 } from "./aws";
import { hasAwsVideoConfig } from "./env";
import { fetchSubtitleMappings, getSubtitleListResponse } from "./external-api";
import { sampleMappings, sampleVideos } from "./mock-data";

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
