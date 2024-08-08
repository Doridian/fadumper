/* eslint-disable import/no-unused-modules */
import { Cheerio, CheerioAPI, load as cheerioLoad, Element } from 'cheerio';

export interface IUser {
    id: string;
    name: string;
}

export interface ISubmissionPreview {
    id: string;
    thumbnail: URL;
    title: string;
    uploader: IUser;
}

export interface ISubmission extends ISubmissionPreview {
    file: URL;
    description: string;
}

interface IPaginatedResponse<X> {
    nextPage: number | undefined;
    prevPage: number | undefined;
    data: X;
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

type PaginatedFetchFunction<X, Y> = (param: Y, page: number) => Promise<IPaginatedResponse<X[]>>;

export class FurAffinityAPI {
    private static readonly USER_ID_REGEX = /\/user\/([^/]+)(\/|$)/;
    private static readonly SUBMISSION_ID_REGEX = /\/view\/([^/]+)(\/|$)/;
    private static readonly STRIP_TRAILING_SLASHES = /\/+$/;
    private static readonly BASE_URL = 'https://www.furaffinity.net';

    public constructor(
        private readonly cookieA = '',
        private readonly cookieB = '',
    ) {}

    private static async autoPaginate<X, Y>(func: PaginatedFetchFunction<X, Y>, req: Y): Promise<X[]> {
        const result: X[] = [];
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
        const title = $('title').text();
        if (title === 'System Error') {
            throw new FASystemError($('div.section-body').text());
        }
    }

    private static parseUserAnchor(elem: Cheerio<Element>): IUser {
        return {
            id: FurAffinityAPI.USER_ID_REGEX.exec(elem.attr('href') ?? '')?.[1] ?? '',
            name: elem.text(),
        };
    }

    private static parseSubmissionFigure(reqUrl: URL, elem: Cheerio<Element>): ISubmissionPreview {
        const figCaption = elem.find('figcaption');
        return {
            id: FurAffinityAPI.SUBMISSION_ID_REGEX.exec(elem.find('a').attr('href') ?? '')?.[1] ?? '',
            thumbnail: new URL(elem.find('img').attr('src') ?? '', reqUrl),
            title: figCaption.find('p:first').text(),
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

    private static enhanceResultWithPagination<X>(
        result: X,
        $: CheerioAPI,
        reqUrl: URL,
        nextPageMatcher: string,
        prevPageMatcher: string,
    ): IPaginatedResponse<X> {
        return {
            nextPage: FurAffinityAPI.parsePageUrl(reqUrl, $(`form:contains("${nextPageMatcher}")`).attr('action')),
            prevPage: FurAffinityAPI.parsePageUrl(reqUrl, $(`form:contains("${prevPageMatcher}")`).attr('action')),
            data: result,
        };
    }

    public async watchingListPage(userID: string, page = 1): Promise<IPaginatedResponse<IUser[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }

        const url = new URL(`/watchlist/by/${userID}/${page}/`, FurAffinityAPI.BASE_URL);
        const $ = await this.fetchURL(url);

        const items = $('div.watch-list-items a').map((_, elem) => {
            return FurAffinityAPI.parseUserAnchor($(elem));
        });

        return FurAffinityAPI.enhanceResultWithPagination(items.get(), $, url, 'Next ', 'Back ');
    }

    public async galleryPage(userID: string, page = 1): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        return this.rawGalleryParse(userID, 'gallery', page);
    }

    public async scrapsPage(userID: string, page = 1): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        return this.rawGalleryParse(userID, 'scraps', page);
    }

    public async watchingListFull(userID: string): Promise<IUser[]> {
        return FurAffinityAPI.autoPaginate(this.watchingListPage.bind(this), userID);
    }

    private async fetchURL(url: URL): Promise<CheerioAPI> {
        if (url.protocol !== 'https:' || url.host !== 'www.furaffinity.net') {
            throw new Error(`Invalid URL: ${url.href});`);
        }

        const response = await fetch(url, {
            headers: {
                cookie: `a=${this.cookieA}; b=${this.cookieB}`,
            },
        });

        if (response.status !== 200) {
            throw new HttpError(response.status, url);
        }

        const $ = cheerioLoad(await response.text());
        FurAffinityAPI.checkSystemError($);
        return $;
    }

    private async rawGalleryParse(
        userID: string,
        category: string,
        page = 1,
    ): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }

        const url = new URL(`/${category}/${userID}/${page}/`, FurAffinityAPI.BASE_URL);
        const $ = await this.fetchURL(url);

        const items = $('figure').map((_, elem) => {
            return FurAffinityAPI.parseSubmissionFigure(url, $(elem));
        });

        return FurAffinityAPI.enhanceResultWithPagination(items.get(), $, url, 'Next', 'Prev');
    }
}
