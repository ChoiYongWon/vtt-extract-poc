import {
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RunTaskCommand,
  type RunTaskCommandInput
} from "@aws-sdk/client-ecs";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FolderEntry, JobMeta, Segment, SubtitleMapping, VideoFolderData, VideoItem, VttOption } from "@vtt/types";
import { getServerEnv } from "./env";

let s3Client: S3Client | undefined;
let ecsClient: ECSClient | undefined;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: getServerEnv().awsRegion });
  }

  return s3Client;
}

function getEcsClient() {
  if (!ecsClient) {
    ecsClient = new ECSClient({ region: getServerEnv().awsRegion });
  }

  return ecsClient;
}

function safeNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toLectureName(s3Key: string) {
  const fileName = s3Key.split("/").at(-1) ?? s3Key;
  return fileName.replace(/\.[^.]+$/, "");
}

async function getProcessingS3Keys(): Promise<Set<string>> {
  const env = getServerEnv();
  if (!env.ecsCluster) return new Set();

  try {
    const ecs = getEcsClient();
    const { taskArns = [] } = await ecs.send(
      new ListTasksCommand({ cluster: env.ecsCluster, desiredStatus: "RUNNING" })
    );
    if (taskArns.length === 0) return new Set();

    const { tasks = [] } = await ecs.send(
      new DescribeTasksCommand({ cluster: env.ecsCluster, tasks: taskArns })
    );

    const keys = new Set<string>();
    for (const task of tasks) {
      for (const container of task.overrides?.containerOverrides ?? []) {
        const s3KeyEnv = container.environment?.find((e) => e.name === "S3_KEY");
        if (s3KeyEnv?.value) keys.add(s3KeyEnv.value);
      }
    }
    return keys;
  } catch {
    return new Set();
  }
}

export function deriveSubtitleObjectKey(s3Key: string) {
  const dir = s3Key.split("/").slice(0, -1).join("/");
  const name = toLectureName(s3Key);
  return dir ? `${dir}/${name}.vtt` : `${name}.vtt`;
}

export async function listFolderFromS3(
  prefix: string,
  mappingByS3Key: Map<string, SubtitleMapping>
): Promise<VideoFolderData> {
  const env = getServerEnv();
  const bucket = env.awsS3Bucket;

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is required");
  }

  const s3 = getS3Client();
  const [response, processingKeys] = await Promise.all([
    s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/" })),
    getProcessingS3Keys()
  ]);

  const subtitleKeys = new Set(
    (response.Contents ?? []).flatMap((item) =>
      item.Key?.endsWith(".vtt") ? [item.Key] : []
    )
  );

  const folders: FolderEntry[] = (response.CommonPrefixes ?? [])
    .filter((cp) => cp.Prefix)
    .map((cp) => ({
      prefix: cp.Prefix!,
      name: cp.Prefix!.slice(prefix.length).replace(/\/$/, "")
    }));

  const objects = (response.Contents ?? []).filter(
    (item) => item.Key && !item.Key.endsWith("/") && !item.Key.endsWith(".vtt")
  );

  const items = await Promise.all(
    objects.map(async (object) => {
      const key = object.Key!;
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const mapping = mappingByS3Key.get(key);
      const derivedSubtitleKey = deriveSubtitleObjectKey(key);
      const fallbackSubtitleUrl = subtitleKeys.has(derivedSubtitleKey)
        ? `s3://${bucket}/${derivedSubtitleKey}`
        : undefined;
      const vttS3Url = mapping?.vttS3Url ?? fallbackSubtitleUrl;
      const presignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 * 60 }
      );
      const jobStatus = vttS3Url ? "done" : processingKeys.has(key) ? "processing" : "pending";

      return {
        s3Key: key,
        title: key.split("/").at(-1) ?? key,
        size: object.Size ?? 0,
        uploadedAt: (object.LastModified ?? new Date()).toISOString(),
        duration: safeNumber(head.Metadata?.duration),
        presignedUrl,
        vttS3Url,
        subtitleId: mapping?.id ?? (vttS3Url ? `auto:${encodeURIComponent(key)}` : undefined),
        mappingType: mapping?.mappingType,
        jobStatus,
        jobStep: jobStatus === "done" ? "완료" : jobStatus === "processing" ? "추출 중" : "미처리"
      } as VideoItem;
    })
  );

  return {
    items: items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    folders
  };
}

export async function listVideosFromS3(mappingByS3Key: Map<string, SubtitleMapping>) {
  const env = getServerEnv();
  const bucket = env.awsS3Bucket;

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is required");
  }

  const s3 = getS3Client();
  const [response, processingKeys] = await Promise.all([
    s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "videos/" })),
    getProcessingS3Keys()
  ]);

  const subtitleKeys = new Set(
    (response.Contents ?? []).flatMap((item) =>
      item.Key?.endsWith(".vtt") ? [item.Key] : []
    )
  );
  const objects = (response.Contents ?? []).filter(
    (item) => item.Key && !item.Key.endsWith("/") && !item.Key.endsWith(".vtt")
  );

  const items = await Promise.all(
    objects.map(async (object) => {
      const key = object.Key!;
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const mapping = mappingByS3Key.get(key);
      const derivedSubtitleKey = deriveSubtitleObjectKey(key);
      const fallbackSubtitleUrl = subtitleKeys.has(derivedSubtitleKey)
        ? `s3://${bucket}/${derivedSubtitleKey}`
        : undefined;
      const vttS3Url = mapping?.vttS3Url ?? fallbackSubtitleUrl;
      const presignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 * 60 }
      );
      const jobStatus = vttS3Url ? "done" : processingKeys.has(key) ? "processing" : "pending";

      const video: VideoItem = {
        s3Key: key,
        title: key.split("/").at(-1) ?? key,
        size: object.Size ?? 0,
        uploadedAt: (object.LastModified ?? new Date()).toISOString(),
        duration: safeNumber(head.Metadata?.duration),
        presignedUrl,
        vttS3Url,
        subtitleId: mapping?.id ?? (vttS3Url ? `auto:${encodeURIComponent(key)}` : undefined),
        mappingType: mapping?.mappingType,
        jobStatus,
        jobStep: jobStatus === "done" ? "완료" : jobStatus === "processing" ? "추출 중" : "미처리"
      };

      return video;
    })
  );

  return items.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

export async function listSubtitleOptionsFromS3() {
  const env = getServerEnv();
  const bucket = env.awsS3Bucket;

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is required");
  }

  const s3 = getS3Client();
  const response = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: "videos/" })
  );

  const options: VttOption[] = (response.Contents ?? [])
    .filter((item) => item.Key && item.Key.endsWith(".vtt"))
    .map((item) => {
      const key = item.Key!;
      return {
        key,
        label: key.split("/").at(-1) ?? key,
        vttS3Url: `s3://${bucket}/${key}`
      };
    });

  return options.sort((left, right) => left.label.localeCompare(right.label));
}

export async function runTranscribeTask(job: JobMeta) {
  const env = getServerEnv();
  const bucket = env.awsS3Bucket;

  if (!bucket || !env.openAiApiKey) {
    throw new Error("AWS_S3_BUCKET and OPENAI_API_KEY are required");
  }

  if (!env.ecsCluster || !env.ecsTaskDefinition || !env.ecsSubnet || !env.ecsSecurityGroup) {
    throw new Error("ECS configuration is incomplete");
  }

  const input: RunTaskCommandInput = {
    cluster: env.ecsCluster,
    taskDefinition: env.ecsTaskDefinition,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [env.ecsSubnet],
        securityGroups: [env.ecsSecurityGroup],
        assignPublicIp: "ENABLED"
      }
    },
    overrides: {
      containerOverrides: [
        {
          name: env.ecsContainerName,
          environment: [
            { name: "JOB_ID", value: job.jobId },
            { name: "S3_KEY", value: job.s3Key },
            { name: "S3_BUCKET", value: bucket },
            { name: "OPENAI_API_KEY", value: env.openAiApiKey },
            { name: "AWS_REGION", value: env.awsRegion }
          ]
        }
      ]
    }
  };

  const response = await getEcsClient().send(new RunTaskCommand(input));

  if ((response.failures?.length ?? 0) > 0) {
    throw new Error(response.failures?.map((failure) => failure.reason).join(", ") || "ECS RunTask failed");
  }

  return response;
}

export async function readVttFromS3(vttS3Url: string): Promise<string> {
  const bucket = getServerEnv().awsS3Bucket;
  if (!bucket) throw new Error("AWS_S3_BUCKET is required");

  const [, , , ...keyParts] = vttS3Url.split("/");
  const key = keyParts.join("/");
  if (!key) throw new Error("Invalid VTT S3 URL");

  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  return (await response.Body?.transformToString()) ?? "";
}

export async function uploadVttToS3(vttS3Url: string, body: string) {
  const bucket = getServerEnv().awsS3Bucket;
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is required");
  }

  const [, , , ...keyParts] = vttS3Url.split("/");
  const key = keyParts.join("/");
  if (!key) {
    throw new Error("Invalid VTT S3 URL");
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/vtt; charset=utf-8"
    })
  );

  return `s3://${bucket}/${key}`;
}

export function segmentsToVtt(segments: Segment[]) {
  const toTimestamp = (value: number) => {
    const totalMilliseconds = Math.max(0, Math.floor(value * 1000));
    const hours = Math.floor(totalMilliseconds / 3_600_000);
    const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
    const milliseconds = totalMilliseconds % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  };

  return `WEBVTT\n\n${segments
    .map(
      (segment, index) =>
        `${index + 1}\n${toTimestamp(segment.start)} --> ${toTimestamp(segment.end)}\n${segment.text}\n`
    )
    .join("\n")}\n`;
}

export function deriveMockSubtitleUrl(s3Key: string) {
  const dir = s3Key.split("/").slice(0, -1).join("/");
  const name = toLectureName(s3Key);
  return dir ? `s3://demo-bucket/${dir}/${name}.vtt` : `s3://demo-bucket/${name}.vtt`;
}
