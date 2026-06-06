import { Storage } from '@google-cloud/storage';
import { StorageProvider, UploadOptions } from './storage-provider';
import config from '../../config';

export class FirebaseProvider implements StorageProvider {
  readonly name = 'firebase';

  validateConfig(): void {
    const { projectId, privateKey, clientEmail, bucketName } = config.firebaseConfig;
    // We allow application default credentials if email/key are missing, but we MUST have a bucket
    if (!bucketName) {
      throw new Error('Firebase Storage bucketName (FIREBASE_STORAGE_BUCKET) is required for Firebase provider.');
    }
  }

  async uploadFile({
    filePath,
    key,
    contentType,
    logger,
  }: UploadOptions): Promise<boolean> {
    const { projectId, privateKey, clientEmail, bucketName } = config.firebaseConfig;

    const storageOptions: any = {};
    if (projectId) storageOptions.projectId = projectId;
    if (clientEmail && privateKey) {
      storageOptions.credentials = {
        client_email: clientEmail,
        private_key: privateKey,
      };
    }

    const storage = new Storage(storageOptions);
    const bucket = storage.bucket(bucketName as string);

    try {
      logger.info(`Starting upload to Firebase Storage bucket ${bucketName}...`);
      await bucket.upload(filePath, {
        destination: key,
        metadata: {
          contentType: contentType,
        },
      });
      logger.info(`Successfully uploaded to Firebase Storage: ${key}`);
      return true;
    } catch (error) {
      logger.error('Failed to upload to Firebase Storage', error);
      throw error;
    }
  }

  async getSignedUrl(key: string, options?: { expiresInSeconds?: number }): Promise<string> {
    const { projectId, privateKey, clientEmail, bucketName } = config.firebaseConfig;
    const storageOptions: any = {};
    if (projectId) storageOptions.projectId = projectId;
    if (clientEmail && privateKey) {
      storageOptions.credentials = {
        client_email: clientEmail,
        private_key: privateKey,
      };
    }
    const storage = new Storage(storageOptions);
    const bucket = storage.bucket(bucketName as string);
    const file = bucket.file(key);

    const expires = Date.now() + (options?.expiresInSeconds || 3600) * 1000;
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires,
    });
    return url;
  }
}
