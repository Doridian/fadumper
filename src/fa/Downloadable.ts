import { Stats } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { RawAPI } from './RawAPI.js';

export class DownloadableFile {
    public readonly localPath: string;
    public readonly url: URL;

    public constructor(
        private readonly rawAPI: RawAPI,
        url: URL | string,
        prefix?: string,
    ) {
        if (!prefix) {
            throw new Error('Prefix is required');
        }
        this.url = typeof url === 'string' ? new URL(url) : url;
        this.localPath = path.join(prefix, `${this.url.host}${this.url.pathname}`);
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

        await mkdir(path.dirname(this.localPath), { recursive: true });
        await this.rawAPI.downloadFile(this.url, this.localPath);
    }
}
