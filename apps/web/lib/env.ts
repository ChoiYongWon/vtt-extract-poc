const requiredServerEnv = [
  "AWS_REGION",
  "AWS_S3_BUCKET"
] as const;

const requiredRuntimeEnv = [
  "AWS_REGION",
  "AWS_S3_BUCKET",
  "ECS_CLUSTER",
  "ECS_TASK_DEFINITION",
  "ECS_CONTAINER_NAME",
  "ECS_SUBNET",
  "ECS_SECURITY_GROUP",
  "OPENAI_API_KEY"
] as const;

export function getServerEnv() {
  return {
    awsRegion: process.env.AWS_REGION ?? "ap-northeast-2",
    awsS3Bucket: process.env.AWS_S3_BUCKET,
    ecsCluster: process.env.ECS_CLUSTER,
    ecsTaskDefinition: process.env.ECS_TASK_DEFINITION,
    ecsContainerName: process.env.ECS_CONTAINER_NAME ?? "worker",
    ecsSubnet: process.env.ECS_SUBNET,
    ecsSecurityGroup: process.env.ECS_SECURITY_GROUP,
    externalApiUrl: process.env.EXTERNAL_API_URL,
    externalApiToken: process.env.EXTERNAL_API_TOKEN,
    openAiApiKey: process.env.OPENAI_API_KEY
  };
}

export function hasAwsVideoConfig() {
  const env = getServerEnv();
  return requiredServerEnv.every((key) => Boolean(process.env[key])) && Boolean(env.awsS3Bucket);
}

export function hasEcsConfig() {
  const env = getServerEnv();
  return Boolean(env.ecsCluster && env.ecsTaskDefinition && env.ecsSubnet && env.ecsSecurityGroup);
}

export function hasExternalApiConfig() {
  return Boolean(getServerEnv().externalApiUrl);
}

export function getMissingRuntimeEnv() {
  return requiredRuntimeEnv.filter((key) => !process.env[key]);
}

export function getRuntimeMode() {
  return getMissingRuntimeEnv().length === 0 ? "real" : "mock";
}
