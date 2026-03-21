import * as fs from 'fs'
import * as path from 'path'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { UpdateConfig } from '../../types/config.schema'

export class UpdateStorageClient {
  private client: S3Client
  private bucket: string

  constructor(config: UpdateConfig) {
    this.bucket = config.bucket
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: true
    })
  }

  async readText(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    )

    const chunks: Buffer[] = []
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks).toString('utf-8')
  }

  async downloadToFile(key: string, destination: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    )

    await fs.promises.mkdir(path.dirname(destination), { recursive: true })
    const output = fs.createWriteStream(destination)
    const body = response.Body as NodeJS.ReadableStream

    await new Promise<void>((resolve, reject) => {
      body.on('error', reject)
      output.on('error', reject)
      output.on('finish', resolve)
      body.pipe(output)
    })
  }
}
