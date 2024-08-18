import { Hash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import { CheerioAPI, load as cheerioLoad } from 'cheerio';

const httpsAgent = new Agent({ keepAlive: true });

const HTTP_RETRIES = Number.parseInt(process.env.HTTP_RETRIES ?? '3', 10);

interface IResponse {
    res: IncomingMessage;
    body: Buffer;
}

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

    public async downloadFile(url: URL, dest: string, hash?: Hash): Promise<void> {
        const response = await this.fetchRaw(url, false, false);

        const file = createWriteStream(dest);

        await new Promise((resolve, reject) => {
            response.res.on('data', (chunk: Buffer) => {
                if (hash) {
                    hash.update(chunk);
                }
                file.write(chunk, (err) => {
                    if (err) {
                        reject(err);
                    }
                });
            });
            response.res.on('end', resolve);
            response.res.on('error', reject);
        });
    }

    public async fetchHTML(url: URL): Promise<CheerioAPI> {
        let response;
        let lastError: Error = new Error('Unknown error, this should not happen');
        let retries = HTTP_RETRIES;
        while (retries-- > 0) {
            try {
                // eslint-disable-next-line no-await-in-loop
                response = await this.fetchRaw(url, true, true);
                break;
            } catch (error) {
                if (error instanceof HttpError && error.status >= 500 && error.status < 600) {
                    lastError = error;
                    continue;
                }

                if (error instanceof FASystemError) {
                    const msg = error.faMessage.toLowerCase();
                    if (
                        msg.includes('the submission you are trying to find is not in our database') ||
                        msg.includes(
                            'the page you are trying to reach is currently pending deletion by a request from its owner',
                        )
                    ) {
                        lastError = new HttpError(404, url);
                        continue;
                    }
                }

                throw error;
            }
        }

        if (!response) {
            throw lastError;
        }

        const $ = cheerioLoad(response.body);
        RawAPI.checkSystemError($);
        return $;
    }

    private async fetchRaw(url: URL, readBody: boolean, includeCookies: boolean): Promise<IResponse> {
        if (includeCookies && (url.protocol !== 'https:' || url.host !== 'www.furaffinity.net')) {
            throw new Error(`Invalid URL for Cookies: ${url.href});`);
        }

        return new Promise((resolve, reject) => {
            request(
                {
                    host: url.host,
                    port: url.port,
                    path: url.pathname + url.search,
                    method: 'GET',
                    agent: httpsAgent,
                    headers: {
                        cookie: includeCookies ? `a=${this.cookieA}; b=${this.cookieB}` : '',
                    },
                },
                (res) => {
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode > 299)) {
                        reject(new HttpError(res.statusCode, url));
                        return;
                    }

                    if (readBody) {
                        const bodyChunks: Buffer[] = [];
                        res.on('data', (chunk: Buffer) => {
                            bodyChunks.push(chunk);
                        });
                        res.on('end', () => {
                            resolve({
                                res,
                                body: Buffer.concat(bodyChunks),
                            });
                        });
                        res.on('error', reject);
                        return;
                    }

                    resolve({
                        res,
                        body: Buffer.alloc(0),
                    });
                },
            ).end();
        });
    }
}
