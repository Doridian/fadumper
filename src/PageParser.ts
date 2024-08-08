/* eslint-disable import/no-unused-modules */
import { Cheerio, CheerioAPI, Element } from 'cheerio';
import { ElementType } from 'domelementtype';
import { IPaginatedResponse, ISubmission, ISubmissionPreview, IUserPreview } from './models';

/* eslint-disable @typescript-eslint/member-ordering */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PageParser {
    private static readonly USER_ID_REGEX = /\/user\/([^/]+)(\/|$)/;
    private static readonly SUBMISSION_ID_REGEX = /\/view\/([^/]+)(\/|$)/;
    private static readonly STRIP_TRAILING_SLASHES = /\/+$/;
    private static readonly STRIP_INVISIBLE_WHITESPACE = /\s+/g;

    public static enhanceResultWithPagination<Entry>(
        result: Entry,
        $: CheerioAPI,
        reqUrl: URL,
        nextPageMatcher: string,
        prevPageMatcher: string,
    ): IPaginatedResponse<Entry> {
        return {
            nextPage: PageParser.parsePageUrl(reqUrl, $(`form:contains("${nextPageMatcher}")`).attr('action')),
            prevPage: PageParser.parsePageUrl(reqUrl, $(`form:contains("${prevPageMatcher}")`).attr('action')),
            data: result,
        };
    }

    public static parseSubmission($: CheerioAPI, url: URL): Omit<ISubmission, 'id'> {
        const imgElement = $('img#submissionImg');

        return {
            thumbnail: new URL(imgElement.attr('data-preview-src') ?? '', url),
            title: $('div.submission-title').text().trim(),
            uploader: PageParser.parseUserAnchor($('div.submission-id-sub-container a')),
            file: new URL(imgElement.attr('data-fullview-src') ?? '', url),
            description: PageParser.parseHTMLUserContent($, $('div.submission-description')),
            category: $('span.category-name').first().text().trim(),
            type: $('span.type-name').first().text().trim(),
            species: $('strong.highlight:contains("Species") + span').first().text().trim(),
            gender: $('strong.highlight:contains("Gender") + span').first().text().trim(),
        };
    }

    public static parseUserAnchor(elem: Cheerio<Element>): IUserPreview {
        return {
            id: PageParser.USER_ID_REGEX.exec(elem.attr('href') ?? '')?.[1] ?? '',
            name: elem.text().trim(),
        };
    }

    public static parseSubmissionFigure(reqUrl: URL, elem: Cheerio<Element>): ISubmissionPreview {
        const figCaption = elem.find('figcaption');
        return {
            id: PageParser.SUBMISSION_ID_REGEX.exec(elem.find('a').attr('href') ?? '')?.[1] ?? '',
            thumbnail: new URL(elem.find('img').attr('src') ?? '', reqUrl),
            title: figCaption.find('p:first').text().trim(),
            uploader: PageParser.parseUserAnchor(figCaption.find('p:last a')),
        };
    }

    private static parsePageUrl(reqUrl: URL, pageHref: string | undefined): number | undefined {
        if (!pageHref) {
            return undefined;
        }

        const pageUrl = new URL(pageHref, reqUrl);
        const normalizedPagePath = PageParser.normalizedPath(pageUrl);
        // If the link has the same as the current page, we have to assume we're at the end
        if (PageParser.normalizedPath(reqUrl) === normalizedPagePath) {
            return undefined;
        }

        return Number.parseInt(normalizedPagePath.split('/').pop() ?? '1', 10);
    }

    private static normalizedPath(url: URL): string {
        return url.pathname.replace(PageParser.STRIP_TRAILING_SLASHES, '');
    }

    private static parseHTMLUserContent($: CheerioAPI, elem: Cheerio<Element>): string {
        let result = '';
        const addToResult = (str: string) => {
            const endsWithSpace = str.endsWith(' ');
            result +=
                (!result.endsWith(' ') && str.startsWith(' ') ? ' ' : '') + str.trim() + (endsWithSpace ? ' ' : '');
        };

        for (const child of elem.contents()) {
            if (child.type === ElementType.Text) {
                addToResult(child.data.replace(PageParser.STRIP_INVISIBLE_WHITESPACE, ' '));
                continue;
            }

            if (child.type !== ElementType.Tag) {
                continue;
            }

            switch (child.tagName.toLowerCase()) {
                case 'br':
                    result += '\n'; // Do not call addToResult as this never gets whitespaces
                    continue;
                case 'a': {
                    const childCheerio = $(child);
                    if (childCheerio.hasClass('iconusername')) {
                        const hasUsernameSuffix = !!childCheerio.text().trim();
                        const userPreview = PageParser.parseUserAnchor(childCheerio);
                        addToResult(hasUsernameSuffix ? `:icon${userPreview.name}:` : `:${userPreview.name}icon:`);
                    } else if (childCheerio.hasClass('linkusername')) {
                        const userPreview = PageParser.parseUserAnchor(childCheerio);
                        addToResult(`:link${userPreview.name}:`);
                    } else {
                        throw new Error(`Unknown link type: ${childCheerio.toString()}`);
                    }
                    continue;
                }
            }

            throw new Error(`Unknown element type: ${child.tagName}`);
        }

        return result.trim();
    }
}
