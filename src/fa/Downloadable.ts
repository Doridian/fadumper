import { createHash, randomUUID } from 'node:crypto';
import { Stats } from 'node:fs';
import { rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { checkPathSafe, mkdirp, mkdirpFor } from '../lib/utils.js';
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
    ) {
        this.url = typeof url === 'string' ? new URL(url) : url;
        const subPath = `${this.url.host}${decodeURI(this.url.pathname)}`.replaceAll('\\', '/');
        if (!checkPathSafe(subPath)) {
            throw new Error(`Unsafe path: ${subPath}`);
        }
        this.ext = path.extname(decodeURI(this.url.pathname).replaceAll('\\', '/'));
    }

    public async getInfo(): Promise<Stats> {
        return stat(this.getPath());
    }

    public getPath(): string {
        if (!this.hash) {
            throw new Error('File not downloaded');
        }

        return path.join(
            HASH_PATH,
            this.hash.slice(0, 2),
            this.hash.slice(2, 4),
            `${this.hash}${path.extname(this.ext)}`,
        );
    }

    public getHash(): string {
        if (!this.hash) {
            throw new Error('File not downloaded');
        }

        return this.hash;
    }

    public async isDownloaded(): Promise<boolean> {
        try {
            const info = await this.getInfo();
            return info.isFile();
        } catch {
            return false;
        }
    }

    public async download(): Promise<void> {
        if (await this.isDownloaded()) {
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
