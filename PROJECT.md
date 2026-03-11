# VTT POC Project

## Current Milestone

This repository currently runs a direct `S3 -> ECS Fargate worker -> S3` extraction flow.

- The web app lists source videos from `s3://<bucket>/videos/`
- The web app starts a worker task through ECS `RunTask`
- The worker downloads the MP4, extracts audio, calls Whisper, and uploads a VTT file to `s3://<bucket>/subtitles/<video-name>.vtt`
- The web app detects finished VTT files by reading S3 directly

Redis-backed live progress streaming is intentionally deferred for now.

## What Works Now

- S3 video listing
- ECS task launch from the web app
- Worker transcription pipeline
- VTT upload to S3
- UI refresh to detect completed subtitles
- Manual VTT save/update flow

## Deferred

The following items are explicitly postponed to a later milestone:

- Redis pub/sub for live worker status
- SSE-based real-time progress updates
- Automatic completion callbacks through Redis
- External API-driven lecture/VTT mapping automation

## Runtime Model

### Web

Required runtime env for the current milestone:

- `AWS_REGION`
- `AWS_S3_BUCKET`
- `ECS_CLUSTER`
- `ECS_TASK_DEFINITION`
- `ECS_CONTAINER_NAME`
- `ECS_SUBNET`
- `ECS_SECURITY_GROUP`
- `OPENAI_API_KEY`

### Worker

The ECS task receives these env values at run time:

- `JOB_ID`
- `S3_KEY`
- `S3_BUCKET`
- `AWS_REGION`
- `OPENAI_API_KEY`

## Current User Flow

1. Open the web app
2. Load videos from S3
3. Click subtitle extraction
4. Web calls ECS `RunTask`
5. Worker creates `subtitles/<video-name>.vtt`
6. Refresh the list to see the generated subtitle file

## Roadmap

1. Reintroduce Redis for live worker progress
2. Restore SSE status streaming in the web app
3. Add durable job state storage
4. Reconnect external lecture/VTT mapping APIs
5. Add end-to-end production deployment docs
