import { createWriteStream, PathLike } from 'node:fs';
import { WritableStream } from 'node:stream/web';
import { CheerioAPI, load as cheerioLoad } from 'cheerio';

export class HttpError extends Error {
    public constructor(
        public readonly status: number,
        public readonly url: URL,
    ) {
        super(`HTTP error ${status} fetching ${url.href}`);
        this.name = 'HttpError';
    }
}

export class FASystemError extends Error {
    public constructor(public readonly faMessage: string) {
        super(`System error: ${faMessage}`);
        this.name = 'FASystemError';
    }
}

export class RawAPI {
    public static readonly BASE_URL = 'https://www.furaffinity.net';

    public constructor(
        private readonly cookieA = '',
        private readonly cookieB = '',
    ) {}

    private static checkSystemError($: CheerioAPI): void {
        const titleLower = $('title').text().trim().toLowerCase();
        if (titleLower === 'system error') {
            throw new FASystemError($('div.section-body').text().trim());
        }
    }

    public async downloadFile(url: URL, dest: PathLike): Promise<void> {
        const response = await this.fetchRaw(url, false);

        const file = createWriteStream(dest);
        const fileStream = new WritableStream({
            write(chunk) {
                file.write(chunk);
            },
            close() {
                file.close();
            },
        });

        await response.body?.pipeTo(fileStream);
    }

    public async fetchHTML(url: URL): Promise<CheerioAPI> {
        const response = await this.fetchRaw(url, true);

        const $ = cheerioLoad(await response.text());
        RawAPI.checkSystemError($);
        return $;
    }

    private async fetchRaw(url: URL, includeCookies: boolean): Promise<Response> {
        if (includeCookies && (url.protocol !== 'https:' || url.host !== 'www.furaffinity.net')) {
            throw new Error(`Invalid URL for Cookies: ${url.href});`);
        }

        const response = await fetch(url, {
            headers: {
                cookie: includeCookies ? `a=${this.cookieA}; b=${this.cookieB}` : '',
            },
            keepalive: true,
            redirect: 'follow',
        });

        if (response.status < 200 || response.status > 299) {
            throw new HttpError(response.status, url);
        }

        return response;
    }
}
