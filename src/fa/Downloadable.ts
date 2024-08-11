import { Stats } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { RawAPI } from './RawAPI';

export class DownloadableFile {
    public readonly localPath: string;

    public constructor(
        private readonly rawAPI: RawAPI,
        public readonly url: URL,
        prefix?: string,
    ) {
        this.localPath = path.join(prefix ?? './downloads', `${url.host}${url.pathname}`);
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
