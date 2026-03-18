import type { Segment, SubtitleMapping, VideoItem } from "@vtt/types";

export const sampleSegments: Segment[] = [
  { start: 12, end: 18.2, text: "안녕하세요. 강의 시작하겠습니다." },
  { start: 18.2, end: 26.5, text: "이번 시간에는 S3 기반 자막 파이프라인을 다룹니다." },
  { start: 26.5, end: 34.7, text: "추출 이후에는 웹에서 바로 편집하고 저장할 수 있습니다." }
];

export const sampleVideos: VideoItem[] = [
  {
    s3Key: "videos/chapter1/lecture-01.mp4",
    title: "lecture-01.mp4",
    size: 423_812_991,
    uploadedAt: "2026-03-08T09:00:00.000Z",
    duration: 532,
    presignedUrl: "https://example.com/videos/chapter1/lecture-01.mp4",
    jobStatus: "done",
    jobStep: "완료",
    vttS3Url: "s3://demo-bucket/videos/chapter1/lecture-01.vtt",
    subtitleId: "1",
    mappingType: "auto"
  },
  {
    s3Key: "videos/chapter1/lecture-02.mp4",
    title: "lecture-02.mp4",
    size: 301_220_444,
    uploadedAt: "2026-03-09T01:42:00.000Z",
    duration: 610,
    presignedUrl: "https://example.com/videos/chapter1/lecture-02.mp4",
    jobStatus: "processing",
    jobStep: "Whisper 연결 중..."
  },
  {
    s3Key: "videos/chapter2/lecture-03.mp4",
    title: "lecture-03.mp4",
    size: 201_800_120,
    uploadedAt: "2026-03-09T16:30:00.000Z",
    duration: 455,
    presignedUrl: "https://example.com/videos/chapter2/lecture-03.mp4",
    jobStatus: "pending",
    jobStep: "미처리"
  },
  {
    s3Key: "videos/chapter2/lecture-04.mp4",
    title: "lecture-04.mp4",
    size: 150_000_000,
    uploadedAt: "2026-03-10T08:00:00.000Z",
    duration: 320,
    presignedUrl: "https://example.com/videos/chapter2/lecture-04.mp4",
    jobStatus: "pending",
    jobStep: "미처리"
  },
  {
    s3Key: "videos/intro.mp4",
    title: "intro.mp4",
    size: 50_000_000,
    uploadedAt: "2026-03-07T12:00:00.000Z",
    duration: 120,
    presignedUrl: "https://example.com/videos/intro.mp4",
    jobStatus: "done",
    jobStep: "완료",
    vttS3Url: "s3://demo-bucket/videos/intro.vtt",
    subtitleId: "4",
    mappingType: "auto"
  }
];

export const sampleMappings: SubtitleMapping[] = [
  {
    id: "1",
    lectureName: "lecture-01",
    s3Key: "videos/chapter1/lecture-01.mp4",
    vttS3Url: "s3://demo-bucket/videos/chapter1/lecture-01.vtt",
    mappingType: "auto"
  },
  {
    id: "2",
    lectureName: "lecture-02",
    s3Key: "videos/chapter1/lecture-02.mp4"
  },
  {
    id: "3",
    lectureName: "lecture-03",
    s3Key: "videos/chapter2/lecture-03.mp4"
  },
  {
    id: "4",
    lectureName: "intro",
    s3Key: "videos/intro.mp4",
    vttS3Url: "s3://demo-bucket/videos/intro.vtt",
    mappingType: "auto"
  }
];
