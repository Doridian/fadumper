import { createHash } from 'node:crypto';
import { Stats } from 'node:fs';
import { mkdir, rename, stat, symlink } from 'node:fs/promises';
import path from 'node:path';
import { RawAPI } from './RawAPI.js';

export const DOWNLOAD_PATH = process.env.DOWNLOAD_PATH ?? './downloads';
const HASH_PATH = path.join(DOWNLOAD_PATH, 'hashes');

const madeDirs = new Set<string>();
async function mkdirCached(dir: string): Promise<void> {
    if (madeDirs.has(dir)) {
        return;
    }

    await mkdir(dir, { recursive: true });
    madeDirs.add(dir);
}

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

    public async download(): Promise<void> {
        if (await this.isDownloaded()) {
            return;
        }

        const tempFile = `${this.localPath}.tmp`;
        const hash = createHash('sha256');

        await mkdirCached(path.dirname(this.localPath));
        await this.rawAPI.downloadFile(this.url, tempFile, hash);

        const hashDigest = hash.digest('hex');
        const hashDir = path.join(HASH_PATH, hashDigest.slice(0, 2), hashDigest.slice(2, 4));
        await mkdirCached(hashDir);

        const hashFile = path.join(hashDir, `${hashDigest}${path.extname(this.localPath)}`);
        await rename(tempFile, hashFile);
        await symlink(path.relative(path.dirname(this.localPath), hashFile), this.localPath);
    }
}
