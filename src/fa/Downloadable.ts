import { Stats } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { RawAPI } from './RawAPI.js';

export const FA_DOWNLOAD_PATH = process.env.FA_DOWNLOAD_PATH ?? './downloads';

export class DownloadableFile {
    public readonly localPath: string;
    public readonly url: URL;

    public constructor(
        private readonly rawAPI: RawAPI,
        url: URL | string,
    ) {
        this.url = typeof url === 'string' ? new URL(url) : url;
        this.localPath = path.join(FA_DOWNLOAD_PATH, `${this.url.host}${this.url.pathname}`);
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
