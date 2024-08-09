import { PageParser } from './PageParser';
import { RawAPI } from './RawAPI';
import { IJournal, IPaginatedResponse, ISubmission, ISubmissionPreview, IUserPreview } from './models';

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

    public async getSubmission(submissionID: string): Promise<ISubmission> {
        const url = new URL(`/view/${submissionID}/`, RawAPI.BASE_URL);
        return {
            ...PageParser.parseSubmission(await this.rawAPI.fetchHTML(url), url),
            id: submissionID,
        };
    }

    public async getJournal(journalID: string): Promise<IJournal> {
        const url = new URL(`/journal/${journalID}/`, RawAPI.BASE_URL);
        return {
            ...PageParser.parseJournal(await this.rawAPI.fetchHTML(url)),
            id: journalID,
        };
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

        const url = new URL(`/watchlist/${watchDirection}/${userId}/${page}/`, RawAPI.BASE_URL);

        const $ = await this.rawAPI.fetchHTML(url);
        const items = $('div.watch-list-items a').map((_, elem) => {
            return PageParser.parseUserAnchor($(elem));
        });

        return PageParser.enhanceResultWithPagination(items.get(), $, url, 'Next ', 'Back ');
    }
}
