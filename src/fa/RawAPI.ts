import { createWriteStream } from 'node:fs';
import { rename } from 'node:fs/promises';
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
        const titleLower = $('section h2').text().trim().toLowerCase();
        if (titleLower !== 'system error' && titleLower !== 'system message') {
            return;
        }
        let text = $('div.section-body').text().trim();
        if (!text) {
            text = $('div.redirect-message').text().trim();
        }
        throw new FASystemError(text);
    }

    public async downloadFile(url: URL, dest: string): Promise<void> {
        const response = await this.fetchRaw(url, false);
        const tempDest = `${dest}.tmp`;

        const file = createWriteStream(tempDest);
        const fileStream = new WritableStream({
            write(chunk) {
                file.write(chunk);
            },
            close() {
                file.close();
            },
        });

        await response.body?.pipeTo(fileStream);
        await rename(tempDest, dest);
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
