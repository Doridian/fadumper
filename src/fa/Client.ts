import { PageParser } from './PageParser.js';
import { RawAPI } from './RawAPI.js';
import { IJournal, IPaginatedResponse, ISubmission, ISubmissionPreview, IUser, IUserPreview } from './models.js';

type PaginatedFetchFunction<Entry, ReqArg> = (param: ReqArg, page: number) => Promise<IPaginatedResponse<Entry[]>>;

export class Client {
    public constructor(private readonly rawAPI: RawAPI) {}

    private static async *autoPaginate<Entry, ReqArg>(
        func: PaginatedFetchFunction<Entry, ReqArg>,
        req: ReqArg,
    ): AsyncGenerator<Entry, void, void> {
        let page: number | undefined = 1;
        while (page) {
            // eslint-disable-next-line no-await-in-loop
            const res = await func(req, page);
            for (const i of res.data) {
                yield i;
            }
            page = res.nextPage;
        }
    }

    public async getWatchingPage(userID: string, page = 1): Promise<IPaginatedResponse<IUserPreview[]>> {
        return this.rawWatchListFetchAndParse(userID, 'by', page);
    }

    public async getWatchedByPage(userID: string, page = 1): Promise<IPaginatedResponse<IUserPreview[]>> {
        return this.rawWatchListFetchAndParse(userID, 'to', page);
    }

    public async galleryPage(userID: string, page = 1): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        return this.rawGalleryFetchAndParse(userID, 'gallery', page);
    }

    public async getScrapsPage(userID: string, page = 1): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        return this.rawGalleryFetchAndParse(userID, 'scraps', page);
    }

    public async getJournalsPage(userID: string, page = 1): Promise<IPaginatedResponse<IJournal[]>> {
        return this.rawJournalFetchAndParse(userID, page);
    }

    public async getBrowsePage(page = 1): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }

        const url = new URL(`/browse/${page}/`, RawAPI.BASE_URL);
        const $ = await this.rawAPI.fetchHTML(url);

        const items = $('figure').map((_, elem) => {
            return PageParser.parseSubmissionFigure(url, $(elem));
        });

        return PageParser.enhanceResultWithPagination(items.get(), $, url, 'Next', 'Back');
    }

    public getWatching(userID: string): AsyncGenerator<IUserPreview, void, void> {
        return Client.autoPaginate(this.getWatchingPage.bind(this), userID);
    }

    public getWatchedBy(userID: string): AsyncGenerator<IUserPreview, void, void> {
        return Client.autoPaginate(this.getWatchedByPage.bind(this), userID);
    }

    public getGallery(userID: string): AsyncGenerator<ISubmissionPreview, void, void> {
        return Client.autoPaginate(this.galleryPage.bind(this), userID);
    }

    public getScraps(userID: string): AsyncGenerator<ISubmissionPreview, void, void> {
        return Client.autoPaginate(this.getScrapsPage.bind(this), userID);
    }

    public getJournals(userID: string): AsyncGenerator<IJournal, void, void> {
        return Client.autoPaginate(this.getJournalsPage.bind(this), userID);
    }

    public async getMaxSubmissionID(): Promise<number> {
        const latestSubmission = await this.getBrowsePage(1);
        let maxID = -1;
        for (const submission of latestSubmission.data) {
            if (submission.id > maxID) {
                maxID = submission.id;
            }
        }
        return maxID;
    }

    public async getSubmission(id: number): Promise<ISubmission> {
        const url = new URL(`/view/${id}/`, RawAPI.BASE_URL);
        return {
            ...PageParser.parseSubmission(await this.rawAPI.fetchHTML(url), url),
            id,
        };
    }

    public async getJournal(id: number): Promise<IJournal> {
        const url = new URL(`/journal/${id}/`, RawAPI.BASE_URL);
        return {
            ...PageParser.parseJournal(await this.rawAPI.fetchHTML(url), url),
            id,
        };
    }

    public async getUserpage(userID: string): Promise<IUser> {
        const url = new URL(`/user/${userID}/`, RawAPI.BASE_URL);
        return PageParser.parsesUserPage(await this.rawAPI.fetchHTML(url), url);
    }

    private async rawJournalFetchAndParse(userID: string, page = 1): Promise<IPaginatedResponse<IJournal[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }

        const url = new URL(`/journals/${userID}/${page}/`, RawAPI.BASE_URL);
        const $ = await this.rawAPI.fetchHTML(url);

        const createdBy = PageParser.parseUserAnchor(
            url,
            $('userpage-nav-avatar a').first(),
            true,
            $('h1 username').first(),
        );

        const items = $('section').map((_, elem) => {
            return {
                ...PageParser.parseJournalSection($, $(elem), url),
                createdBy,
            };
        });

        return PageParser.enhanceResultWithPagination(items.get(), $, url, 'Older', 'Newer');
    }

    private async rawGalleryFetchAndParse(
        userID: string,
        category: 'gallery' | 'scraps',
        page = 1,
    ): Promise<IPaginatedResponse<ISubmissionPreview[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }

        const url = new URL(`/${category}/${userID}/${page}/`, RawAPI.BASE_URL);
        const $ = await this.rawAPI.fetchHTML(url);

        const items = $('figure').map((_, elem) => {
            return PageParser.parseSubmissionFigure(url, $(elem));
        });

        return PageParser.enhanceResultWithPagination(items.get(), $, url, 'Next', 'Prev');
    }

    private async rawWatchListFetchAndParse(
        userId: string,
        watchDirection: 'by' | 'to',
        page = 1,
    ): Promise<IPaginatedResponse<IUserPreview[]>> {
        if (page < 1) {
            throw new Error('Page must be >= 1');
        }
        userId = userId.toLowerCase();

        const url = new URL(`/watchlist/${watchDirection}/${userId}/${page}/`, RawAPI.BASE_URL);

        const $ = await this.rawAPI.fetchHTML(url);
        const items = $('div.watch-list-items a').map((_, elem) => {
            return PageParser.parseUserAnchor(url, $(elem), false);
        });

        return PageParser.enhanceResultWithPagination(items.get(), $, url, 'Next ', 'Back ');
    }
}
