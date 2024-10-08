import { createHash, randomUUID } from 'node:crypto';
import { Stats } from 'node:fs';
import { rename, stat, unlink, utimes } from 'node:fs/promises';
import path from 'node:path';
import { makeHashPath, mkdirp, mkdirpFor } from '../lib/utils.js';
import { RawAPI } from './RawAPI.js';

export const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH ?? './downloads';
const HASH_PATH = path.join(DOWNLOAD_PATH, 'hashes');
const TEMP_PATH = path.join(DOWNLOAD_PATH, 'temp');
await mkdirp(DOWNLOAD_PATH);
await mkdirp(HASH_PATH);
await mkdirp(TEMP_PATH);

export class DownloadableFile {
    public readonly url: URL;
    public readonly ext: string;

    public constructor(
        private readonly rawAPI: RawAPI,
        url: URL | string,
        private hash: string | undefined,
        private readonly touchOnRepeat: boolean,
    ) {
        this.url = typeof url === 'string' ? new URL(url) : url;
        this.ext = path.extname(decodeURI(this.url.pathname).replaceAll('\\', '/'));
    }

    public async getInfo(): Promise<Stats> {
        return stat(this.getPath());
    }

    public getPath(): string {
        const hash = this.getHash();

        if (!this.ext) {
            throw new Error('File extension not found');
        }

        return path.join(HASH_PATH, makeHashPath(hash, this.ext));
    }

    public getHash(): string {
        if (!this.hash) {
            throw new Error('File not downloaded');
        }

        return this.hash;
    }

    public async isDownloaded(): Promise<boolean> {
        if (!this.hash) {
            return false;
        }

        try {
            const info = await this.getInfo();
            return info.isFile();
        } catch {
            return false;
        }
    }

    public async touch(): Promise<void> {
        const hashFile = this.getPath();

        const now = new Date();
        await utimes(hashFile, now, now);
    }

    public async download(): Promise<void> {
        if (await this.isDownloaded()) {
            if (this.touchOnRepeat) {
                await this.touch();
            }
            return;
        }

        const tempFile = path.join(TEMP_PATH, randomUUID());

        try {
            const hash = createHash('sha256');

            await this.rawAPI.downloadFile(this.url, tempFile, hash);

            this.hash = hash.digest('hex');
            const hashFile = this.getPath();
            await mkdirpFor(hashFile);
            await rename(tempFile, hashFile);
        } finally {
            try {
                await unlink(tempFile);
            } catch {
                // Ignore
            }
        }
    }
}
