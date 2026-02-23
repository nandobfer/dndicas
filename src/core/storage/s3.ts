import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.S3_REGION || 'us-east-1';
const ENDPOINT = process.env.S3_ENDPOINT;
const ACCESS_KEY = process.env.S3_ACCESS_KEY;
const SECRET_KEY = process.env.S3_SECRET_KEY;
const BUCKET = process.env.S3_BUCKET || 'default';

let s3Client: S3Client | null = null;

if (ACCESS_KEY && SECRET_KEY && ENDPOINT) {
    s3Client = new S3Client({
        region: REGION,
        endpoint: ENDPOINT,
        credentials: {
            accessKeyId: ACCESS_KEY,
            secretAccessKey: SECRET_KEY,
        },
        forcePathStyle: true, // Required for Minio
    });
} else {
    console.warn("S3 Credentials missing, storage service disabled.");
}

export const uploadFile = async (key: string, body: Buffer | Uint8Array | Blob | string, mimeType?: string) => {
    if (!s3Client) throw new Error("S3 Client not initialized");

    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: mimeType,
    });
    return s3Client.send(command);
}

export const getFileUrl = async (key: string) => {
    if (!s3Client) throw new Error("S3 Client not initialized");
    // Generate public URL if bucket is public, or signed URL
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key
    });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export const getFile = async (key: string) => {
    if (!s3Client) throw new Error("S3 Client not initialized");
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key
    });
    return s3Client.send(command);
}
