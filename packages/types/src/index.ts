export type JobStatus = "pending" | "processing" | "done" | "error";

export type FolderEntry = {
  prefix: string;
  name: string;
};

export type VideoFolderData = {
  items: VideoItem[];
  folders: FolderEntry[];
};

export type Segment = {
  start: number;
  end: number;
  text: string;
};

export type VideoItem = {
  s3Key: string;
  title: string;
  size: number;
  uploadedAt: string;
  duration?: number;
  presignedUrl?: string;
  jobStatus?: JobStatus;
  jobStep?: string;
  vttS3Url?: string;
  subtitleId?: string;
  mappingType?: "auto" | "manual";
};

export type SubtitleMapping = {
  id: string;
  lectureName: string;
  s3Key: string;
  vttS3Url?: string;
  mappingType?: "auto" | "manual";
};

export type VttOption = {
  key: string;
  label: string;
  vttS3Url: string;
};

export type SubtitleListResponse = {
  items: SubtitleMapping[];
  options: VttOption[];
};

export type JobMeta = {
  jobId: string;
  s3Key: string;
  createdAt: string;
  source: "mock" | "ecs";
};
