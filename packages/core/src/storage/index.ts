/**
 * Storage client — S3-compatible (Cloudflare R2 / MinIO / AWS S3).
 *
 * Usage:
 *   import { storage } from '@motoai/core/storage'
 *
 *   await storage.upload('pdfs/toyota-hyryder.pdf', buffer, 'application/pdf')
 *   const url = await storage.getSignedUrl('pdfs/toyota-hyryder.pdf')
 *   const data = await storage.download('pdfs/toyota-hyryder.pdf')
 *   await storage.delete('pdfs/old-file.pdf')
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../config/index.js'

let _client: S3Client | null = null

function getClient(): S3Client {
  if (!_client) {
    if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY || !env.R2_SECRET_KEY) {
      throw new Error('Storage not configured — set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY')
    }
    _client = new S3Client({
      endpoint: env.R2_ENDPOINT,
      region: 'auto',
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY,
        secretAccessKey: env.R2_SECRET_KEY,
      },
    })
  }
  return _client
}

export async function upload(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

export async function download(key: string): Promise<Buffer> {
  const res = await getClient().send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    })
  )
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
    { expiresIn }
  )
}

export async function remove(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    })
  )
}

export const storage = { upload, download, getPresignedUrl, remove }
