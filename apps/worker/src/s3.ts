import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: process.env.AWS_REGION ?? "ap-northeast-2"
});

export async function downloadFromS3(bucket: string, key: string, outputPath: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;

  if (!(body instanceof Readable)) {
    throw new Error("S3 response body is not readable");
  }

  await pipeline(body, createWriteStream(outputPath));
}

export async function uploadToS3(bucket: string, key: string, body: string) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/vtt; charset=utf-8"
    })
  );
}

