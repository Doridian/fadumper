import { Hash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Stream } from 'node:stream';
import axios, { AxiosError, AxiosProxyConfig, AxiosResponse, ResponseType } from 'axios';
import { CheerioAPI, load as cheerioLoad } from 'cheerio';
import { logger } from '../lib/log.js';
import { delay } from '../lib/utils.js';

const HTTP_RETRIES = Number.parseInt(process.env.HTTP_RETRIES ?? '10', 10);
const HTTP_FETCH_TIMEOUT = Number.parseInt(process.env.HTTP_FETCH_TIMEOUT ?? '10000', 10);
const HTTP_STREAM_TIMEOUT = Number.parseInt(process.env.HTTP_STREAM_TIMEOUT ?? '30000', 10);

const ERROR_UNKNOWN = new Error('Unknown error, this should not happen');

const HTTP_AGENT = new HttpAgent({ keepAlive: true });
const HTTPS_AGENT = new HttpsAgent({ keepAlive: true });

const AXIOS_PROXY_CONFIG = ((): AxiosProxyConfig | undefined => {
    if (!process.env.PROXY_URL) {
        return undefined;
    }
    const url = new URL(process.env.PROXY_URL);
    return {
        host: url.hostname,
        port: Number.parseInt(url.port, 10),
        protocol: url.protocol,
        auth: url.username ? { username: url.username, password: url.password } : undefined,
    };
})();

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

    private static checkValidPage($: CheerioAPI): void {
        const onlineStats = $('div.online-stats');
        if (onlineStats.length === 0) {
            throw new Error('Invalid page (no div.online-stats). Partial load?');
        }
    }

    public async downloadFile(url: URL, dest: string, hash?: Hash): Promise<void> {
        const response = await this.fetchRaw(url, 'stream', false);

        const file = createWriteStream(dest);

        await new Promise<void>((resolve, reject) => {
            const resStream = response.data as Stream;
            resStream.on('data', (chunk: Buffer) => {
                if (hash) {
                    hash.update(chunk);
                }
                file.write(chunk, (err) => {
                    if (err) {
                        reject(err);
                    }
                });
            });
            resStream.on('end', () => {
                file.close((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
            resStream.on('error', reject);
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
                response = await this.fetchRaw(url, 'text', true);
                const $ = cheerioLoad(response.data as string);
                RawAPI.checkSystemError($);
                RawAPI.checkSystemMessage($);
                RawAPI.checkValidPage($);
                return $;
            } catch (error) {
                lastError = error;
                if (error instanceof HttpError && error.status >= 500 && error.status < 600) {
                    logger.warn(
                        'HTTP error %d fetching %s, retrying (try %d/%d): %s',
                        error.status,
                        url.href,
                        tryNum + 1,
                        HTTP_RETRIES,
                        error,
                    );
                    continue;
                }

                if (error instanceof FASystemError) {
                    const msg = error.faMessage.toLowerCase();
                    if (
                        msg.includes('the submission you are trying to find is not in our database') ||
                        msg.includes('the page you are trying to reach is currently pending deletion by a request from')
                    ) {
                        throw new HttpError(404, url);
                    }
                }

                logger.warn('Error fetching %s, retrying (try %d/%d): %s', url.href, tryNum + 1, HTTP_RETRIES, error);
                continue;
            }
        }

        throw lastError;
    }

    private async fetchRaw(url: URL, responseType: ResponseType, includeCookies: boolean): Promise<AxiosResponse> {
        if (includeCookies && (url.protocol !== 'https:' || url.host !== 'www.furaffinity.net')) {
            throw new Error(`Invalid URL for Cookies: ${url.href});`);
        }

        try {
            const res = await axios.request({
                url: url.href,
                method: 'GET',
                proxy: AXIOS_PROXY_CONFIG,
                httpAgent: HTTP_AGENT,
                httpsAgent: HTTPS_AGENT,
                timeout: responseType === 'stream' ? HTTP_STREAM_TIMEOUT : HTTP_FETCH_TIMEOUT,
                headers: {
                    cookie: includeCookies ? `a=${this.cookieA}; b=${this.cookieB}` : undefined,
                    'user-agent': 'fadumper (Doridian)',
                },
                responseType,
            });

            return res;
        } catch (error) {
            if (error instanceof AxiosError && error.response) {
                // Code 413/513 are abused by FA for some images somehow...
                if (error.response.status === 513 || error.response.status === 413) {
                    return error.response;
                }
                throw new HttpError(error.response.status, url);
            }
            throw error;
        }
    }
}
