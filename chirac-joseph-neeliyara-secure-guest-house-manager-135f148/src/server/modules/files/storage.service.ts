import { getEnv } from "@/server/config/env";
import { ValidationError } from "@/server/lib/errors";

export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const env = getEnv();
  if (!env.STORAGE_S3_BUCKET || !env.STORAGE_S3_REGION) {
    throw new ValidationError("S3 storage is not configured.");
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: env.STORAGE_S3_REGION,
    endpoint: env.STORAGE_S3_ENDPOINT || undefined,
    credentials:
      env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    forcePathStyle: !!env.STORAGE_S3_ENDPOINT,
  });
  await client.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "private",
      ServerSideEncryption: "AES256",
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const env = getEnv();
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: env.STORAGE_S3_REGION!,
    endpoint: env.STORAGE_S3_ENDPOINT || undefined,
    credentials:
      env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    forcePathStyle: !!env.STORAGE_S3_ENDPOINT,
  });
  const res = await client.send(new GetObjectCommand({ Bucket: env.STORAGE_S3_BUCKET!, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new ValidationError("Unable to read stored object.");
  return Buffer.from(bytes);
}

export async function getSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
  const env = getEnv();
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = new S3Client({
    region: env.STORAGE_S3_REGION!,
    endpoint: env.STORAGE_S3_ENDPOINT || undefined,
    credentials:
      env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    forcePathStyle: !!env.STORAGE_S3_ENDPOINT,
  });
  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.STORAGE_S3_BUCKET!, Key: key }), {
    expiresIn: ttlSeconds,
  });
}
