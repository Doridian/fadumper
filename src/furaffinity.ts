/* eslint-disable import/no-unused-modules */
import { createWriteStream, PathLike } from 'node:fs';
import { WritableStream } from 'node:stream/web';
import { Cheerio, CheerioAPI, load as cheerioLoad, Element } from 'cheerio';
import { ElementType } from 'domelementtype';

export interface IUserPreview {
    id: string;
    name: string;
}

export interface ISubmissionPreview {
    id: string;
    thumbnail: URL;
    title: string;
    uploader: IUserPreview;
}

export interface ISubmission extends ISubmissionPreview {
    file: URL;
    description: string;
    category: string;
    type: string;
    species: string;
    gender: string;
}

interface IPaginatedResponse<Entry> {
    nextPage: number | undefined;
    prevPage: number | undefined;
    data: Entry;
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
    public constructor(msg: string) {
        super(`System error: ${msg}`);
        this.name = 'FASystemError';
    }
}

type PaginatedFetchFunction<Entry, ReqArg> = (param: ReqArg, page: number) => Promise<IPaginatedResponse<Entry[]>>;

export class FurAffinityAPI {
    private static readonly USER_ID_REGEX = /\/user\/([^/]+)(\/|$)/;
    private static readonly SUBMISSION_ID_REGEX = /\/view\/([^/]+)(\/|$)/;
    private static readonly STRIP_TRAILING_SLASHES = /\/+$/;
    private static readonly STRIP_INVISIBLE_WHITESPACE = /\s+/g;
    private static readonly BASE_URL = 'https://www.furaffinity.net';

    public constructor(
        private readonly cookieA = '',
        private readonly cookieB = '',
    ) {}

    private static parseHTMLUserContent($: CheerioAPI, elem: Cheerio<Element>): string {
        let result = '';
        const addToResult = (str: string) => {
            const endsWithSpace = str.endsWith(' ');
            result +=
                (!result.endsWith(' ') && str.startsWith(' ') ? ' ' : '') + str.trim() + (endsWithSpace ? ' ' : '');
        };

        elem.contents().each((_, child) => {
            if (child.type === ElementType.Text) {
                addToResult(child.data.replace(FurAffinityAPI.STRIP_INVISIBLE_WHITESPACE, ' '));
                return;
            }

            if (child.type !== ElementType.Tag) {
                return;
            }

            switch (child.tagName.toLowerCase()) {
                case 'br':
                    result += '\n'; // Do not call addToResult as this never gets whitespaces
                    return;
                case 'a': {
                    const childCheerio = $(child);
                    if (childCheerio.hasClass('iconusername')) {
                        const hasUsernameSuffix = !!childCheerio.text().trim();
                        const userPreview = FurAffinityAPI.parseUserAnchor(childCheerio);
                        addToResult(hasUsernameSuffix ? `:icon${userPreview.name}:` : `:${userPreview.name}icon:`);
                    } else if (childCheerio.hasClass('linkusername')) {
                        const userPreview = FurAffinityAPI.parseUserAnchor(childCheerio);
                        addToResult(`:link${userPreview.name}:`);
                    } else {
                        throw new Error(`Unknown link type: ${childCheerio.toString()}`);
                    }
                    return;
                }
            }

            throw new Error(`Unknown element type: ${child.tagName}`);
        });

        return result.trim();
    }

    private static async autoPaginate<Entry, ReqArg>(
        func: PaginatedFetchFunction<Entry, ReqArg>,
        req: ReqArg,
    ): Promise<Entry[]> {
        const result: Entry[] = [];
        let page: number | undefined = 1;
        while (page) {
            // eslint-disable-next-line no-await-in-loop
            const res = await func(req, page);
            result.push(...res.data);
            page = res.nextPage;
        }

        return result;
    }

    private static checkSystemError($: CheerioAPI): void {
        const titleLower = $('title').text().trim().toLowerCase();
        if (titleLower === 'system error') {
            throw new FASystemError($('div.section-body').text().trim());
        }
    }

    private static parseUserAnchor(elem: Cheerio<Element>): IUserPreview {
        return {
            id: FurAffinityAPI.USER_ID_REGEX.exec(elem.attr('href') ?? '')?.[1] ?? '',
            name: elem.text().trim(),
        };
    }

    private static parseSubmissionFigure(reqUrl: URL, elem: Cheerio<Element>): ISubmissionPreview {
        const figCaption = elem.find('figcaption');
        return {
            id: FurAffinityAPI.SUBMISSION_ID_REGEX.exec(elem.find('a').attr('href') ?? '')?.[1] ?? '',
            thumbnail: new URL(elem.find('img').attr('src') ?? '', reqUrl),
            title: figCaption.find('p:first').text().trim(),
            uploader: FurAffinityAPI.parseUserAnchor(figCaption.find('p:last a')),
        };
    }

    private static normalizedPath(url: URL): string {
        return url.pathname.replace(FurAffinityAPI.STRIP_TRAILING_SLASHES, '');
    }

    private static parsePageUrl(reqUrl: URL, pageHref: string | undefined): number | undefined {
        if (!pageHref) {
            return undefined;
        }

        const pageUrl = new URL(pageHref, reqUrl);
        const normalizedPagePath = FurAffinityAPI.normalizedPath(pageUrl);
        // If the link has the same as the current page, we have to assume we're at the end
        if (FurAffinityAPI.normalizedPath(reqUrl) === normalizedPagePath) {
            return undefined;
        }

        return Number.parseInt(normalizedPagePath.split('/').pop() ?? '1', 10);
    }

    private static enhanceResultWithPagination<Entry>(
        result: Entry,
        $: CheerioAPI,
        reqUrl: URL,
        nextPageMatcher: string,
        prevPageMatcher: string,
    ): IPaginatedResponse<Entry> {
        return {
            nextPage: FurAffinityAPI.parsePageUrl(reqUrl, $(`form:contains("${nextPageMatcher}")`).attr('action')),
            prevPage: FurAffinityAPI.parsePageUrl(reqUrl, $(`form:contains("${prevPageMatcher}")`).attr('action')),
            data: result,
        };
    }

    public async getWatchingPage(userID: string, page = 1): Promise<IPaginatedResponse<IUserPreview[]>> {
        return this.rawWatchListParse(userID, 'by', page);
    }

    public async getWatchedByPage(userID: string, page = 1): Promise<IPaginatedResponse<IUserPreview[]>> {
        return this.rawWatchListParse(userID, 'to', page);
    }

    public async galleryPage(userID: string, page = 1): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        return this.rawGalleryParse(userID, 'gallery', page);
    }

    public async getScrapsPage(userID: string, page = 1): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        return this.rawGalleryParse(userID, 'scraps', page);
    }

    public async getWatching(userID: string): Promise<IUserPreview[]> {
        return FurAffinityAPI.autoPaginate(this.getWatchingPage.bind(this), userID);
    }

    public async getWatchedBy(userID: string): Promise<IUserPreview[]> {
        return FurAffinityAPI.autoPaginate(this.getWatchedByPage.bind(this), userID);
    }

    public async getGallery(userID: string): Promise<ISubmissionPreview[]> {
        return FurAffinityAPI.autoPaginate(this.galleryPage.bind(this), userID);
    }

    public async getScraps(userID: string): Promise<ISubmissionPreview[]> {
        return FurAffinityAPI.autoPaginate(this.getScrapsPage.bind(this), userID);
    }

    public async getSubmission(submissionID: ISubmissionPreview | string): Promise<ISubmission> {
        if (submissionID instanceof Object) {
            submissionID = submissionID.id;
        }

        const url = new URL(`/view/${submissionID}/`, FurAffinityAPI.BASE_URL);
        const $ = await this.fetchHTML(url);

        const imgElement = $('img#submissionImg');

        return {
            id: submissionID,
            thumbnail: new URL(imgElement.attr('data-preview-src') ?? '', url),
            title: $('div.submission-title').text().trim(),
            uploader: FurAffinityAPI.parseUserAnchor($('div.submission-id-sub-container a')),
            file: new URL(imgElement.attr('data-fullview-src') ?? '', url),
            description: FurAffinityAPI.parseHTMLUserContent($, $('div.submission-description')),
            category: $('span.category-name').first().text().trim(),
            type: $('span.type-name').first().text().trim(),
            species: $('strong.highlight:contains("Species") + span').first().text().trim(),
            gender: $('strong.highlight:contains("Gender") + span').first().text().trim(),
        };
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

    private async fetchHTML(url: URL): Promise<CheerioAPI> {
        const response = await this.fetchRaw(url, true);

        const $ = cheerioLoad(await response.text());
        FurAffinityAPI.checkSystemError($);
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

    private async rawWatchListParse(
        userID: string,
        watchDirection: 'by' | 'to',
        page = 1,
    ): Promise<IPaginatedResponse<IUserPreview[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }

        const url = new URL(`/watchlist/${watchDirection}/${userID}/${page}/`, FurAffinityAPI.BASE_URL);
        const $ = await this.fetchHTML(url);

        const items = $('div.watch-list-items a').map((_, elem) => {
            return FurAffinityAPI.parseUserAnchor($(elem));
        });

        return FurAffinityAPI.enhanceResultWithPagination(items.get(), $, url, 'Next ', 'Back ');
    }

    private async rawGalleryParse(
        userID: string,
        category: 'gallery' | 'scraps',
        page = 1,
    ): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }

        const url = new URL(`/${category}/${userID}/${page}/`, FurAffinityAPI.BASE_URL);
        const $ = await this.fetchHTML(url);

        const items = $('figure').map((_, elem) => {
            return FurAffinityAPI.parseSubmissionFigure(url, $(elem));
        });

        return FurAffinityAPI.enhanceResultWithPagination(items.get(), $, url, 'Next', 'Prev');
    }
}
