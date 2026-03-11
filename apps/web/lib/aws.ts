import {
  ECSClient,
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
import type { JobMeta, Segment, SubtitleMapping, VideoItem, VttOption } from "@vtt/types";
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

export function deriveSubtitleObjectKey(s3Key: string) {
  return `subtitles/${toLectureName(s3Key)}.vtt`;
}

export async function listVideosFromS3(mappingByS3Key: Map<string, SubtitleMapping>) {
  const env = getServerEnv();
  const bucket = env.awsS3Bucket;

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is required");
  }

  const s3 = getS3Client();
  const [response, subtitlesResponse] = await Promise.all([
    s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "videos/"
      })
    ),
    s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "subtitles/"
      })
    )
  ]);

  const objects = (response.Contents ?? []).filter((item) => item.Key && !item.Key.endsWith("/"));
  const subtitleKeys = new Set(
    (subtitlesResponse.Contents ?? []).flatMap((item) => (item.Key ? [item.Key] : []))
  );

  const items = await Promise.all(
    objects.map(async (object) => {
      const key = object.Key!;
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key
        })
      );
      const mapping = mappingByS3Key.get(key);
      const derivedSubtitleKey = deriveSubtitleObjectKey(key);
      const fallbackSubtitleUrl = subtitleKeys.has(derivedSubtitleKey)
        ? `s3://${bucket}/${derivedSubtitleKey}`
        : undefined;
      const vttS3Url = mapping?.vttS3Url ?? fallbackSubtitleUrl;
      const presignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key
        }),
        { expiresIn: 60 * 60 }
      );

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
        jobStatus: vttS3Url ? "done" : "pending",
        jobStep: vttS3Url ? "완료" : "미처리"
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
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "subtitles/"
    })
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
  return `s3://demo-bucket/subtitles/${toLectureName(s3Key)}.vtt`;
}
