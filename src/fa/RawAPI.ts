import { Hash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import { Stream } from 'node:stream';
import { createGunzip, createInflate } from 'node:zlib';
import { CheerioAPI, load as cheerioLoad } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from '../lib/log.js';
import { delay } from '../lib/utils.js';

const httpAgentOptions = {
    keepAlive: true,
    timeout: 5000,
};
const httpsAgent = process.env.PROXY_URL
    ? new HttpsProxyAgent(process.env.PROXY_URL, httpAgentOptions)
    : new Agent(httpAgentOptions);

const HTTP_RETRIES = Number.parseInt(process.env.HTTP_RETRIES ?? '3', 10);

const ERROR_UNKNOWN = new Error('Unknown error, this should not happen');

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
        const titleLower = $('body > section h2').text().trim().toLowerCase();
        if (titleLower !== 'system error') {
            return;
        }
        const text = $('div.section-body').text().trim();
        throw new FASystemError(text);
    }

    private static checkSystemMessage($: CheerioAPI): void {
        const titleLower = $('section.notice-message h2').text().trim().toLowerCase();
        if (titleLower !== 'system message') {
            return;
        }
        const text = $('section.notice-message p').text().trim();
        throw new FASystemError(text);
    }

    private static handleBody(res: IncomingMessage, stream: Stream, resolve: (resp: IResponse) => void): void {
        const bodyChunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => {
            bodyChunks.push(chunk);
        });
        stream.on('end', () => {
            resolve({
                res,
                body: Buffer.concat(bodyChunks),
            });
        });
    }

    public async downloadFile(url: URL, dest: string, hash?: Hash): Promise<void> {
        const response = await this.fetchRaw(url, false, false);

        const file = createWriteStream(dest);

        await new Promise<void>((resolve, reject) => {
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
            response.res.on('end', () => {
                file.close((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
            response.res.on('error', reject);
        });
    }

    public async fetchHTML(url: URL): Promise<CheerioAPI> {
        let response;
        let lastError: unknown = ERROR_UNKNOWN;
        for (let tryNum = 0; tryNum < HTTP_RETRIES; tryNum++) {
            if (tryNum > 0) {
                // eslint-disable-next-line no-await-in-loop
                await delay(1000 * 2 ** (tryNum - 1));
            }

            try {
                lastError = ERROR_UNKNOWN;
                // eslint-disable-next-line no-await-in-loop
                response = await this.fetchRaw(url, true, true);
                const $ = cheerioLoad(response.body);
                RawAPI.checkSystemError($);
                RawAPI.checkSystemMessage($);
                return $;
            } catch (error) {
                lastError = error;
                if (error instanceof HttpError && error.status >= 500 && error.status < 600) {
                    logger.warn(
                        'HTTP error %d fetching %s, retrying (try %d/%d)',
                        error.status,
                        url.href,
                        tryNum + 1,
                        HTTP_RETRIES,
                    );
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
                        throw new HttpError(404, url);
                    }
                }

                logger.warn('System error fetching %s, retrying (try %d/%d)', url.href, tryNum + 1, HTTP_RETRIES);
                continue;
            }
        }

        throw lastError;
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
                        'User-Agent': 'fadumper (Doridian)',
                        'accept-encoding': 'gzip, deflate',
                    },
                },
                (res) => {
                    // Code 513 on FA is used for "thumbnail not found" images for some reason
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode > 299) && res.statusCode !== 513) {
                        reject(new HttpError(res.statusCode, url));
                        return;
                    }

                    if (readBody) {
                        const encoding = res.headers['content-encoding'];
                        switch (encoding) {
                            case 'gzip': {
                                const gzipStream = createGunzip();
                                res.pipe(gzipStream);
                                RawAPI.handleBody(res, gzipStream, resolve);
                                break;
                            }
                            case 'deflate': {
                                const deflateStream = createInflate();
                                res.pipe(deflateStream);
                                RawAPI.handleBody(res, deflateStream, resolve);
                                break;
                            }
                            default:
                                RawAPI.handleBody(res, res, resolve);
                                break;
                        }
                        res.on('error', reject);
                        return;
                    }

                    resolve({
                        res,
                        body: Buffer.alloc(0),
                    });
                },
            )
                .on('error', reject)
                .end();
        });
    }
}
