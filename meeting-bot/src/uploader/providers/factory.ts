import { StorageProvider } from './storage-provider';
import { S3StorageProvider } from './s3-storage-provider';
import { AzureBlobStorageProvider } from './azure-blob-storage-provider';
import { FirebaseProvider } from './firebaseProvider';
import config from '../../config';

export function getStorageProvider(): StorageProvider {
  if (config.uploaderType === 'firebase') {
    return new FirebaseProvider();
  }
  if (config.storageProvider === 'azure') {
    return new AzureBlobStorageProvider();
  }
  return new S3StorageProvider();
}
