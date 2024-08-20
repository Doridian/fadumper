import { createHash, randomUUID } from 'node:crypto';
import { Stats } from 'node:fs';
import { rename, stat, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import { mkdirp, mkdirpFor } from '../lib/utils.js';
import { RawAPI } from './RawAPI.js';

export const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH ?? './downloads';
const HASH_PATH = path.join(DOWNLOAD_PATH, 'hashes');
const TEMP_PATH = path.join(DOWNLOAD_PATH, 'temp');
await mkdirp(DOWNLOAD_PATH);
await mkdirp(HASH_PATH);
await mkdirp(TEMP_PATH);

export class DownloadableFile {
    public readonly localPath: string;
    public readonly url: URL;

    public constructor(
        private readonly rawAPI: RawAPI,
        url: URL | string,
    ) {
        this.url = typeof url === 'string' ? new URL(url) : url;
        this.localPath = path.join(DOWNLOAD_PATH, `${this.url.host}${this.url.pathname}`);
    }

    public async getInfo(): Promise<Stats> {
        return stat(this.localPath);
    }

    public async isDownloaded(): Promise<boolean> {
        try {
            const info = await this.getInfo();
            return info.isFile();
        } catch {
            return false;
        }
    }

    public async download(): Promise<string | undefined> {
        if (await this.isDownloaded()) {
            return undefined;
        }

        const tempFile = path.join(TEMP_PATH, randomUUID());

        try {
            const hash = createHash('sha256');

            await mkdirpFor(this.localPath);
            await this.rawAPI.downloadFile(this.url, tempFile, hash);

            const hashDigest = hash.digest('hex');
            const hashFile = path.join(
                HASH_PATH,
                hashDigest.slice(0, 2),
                hashDigest.slice(2, 4),
                `${hashDigest}${path.extname(this.localPath)}`,
            );
            await mkdirpFor(hashFile);
            await rename(tempFile, hashFile);
            await symlink(path.relative(path.dirname(this.localPath), hashFile), this.localPath);

            return hashDigest;
        } catch (error) {
            try {
                await unlink(tempFile);
            } catch {
                // Ignore
            }
            throw error;
        }
    }
}
