/* eslint-disable complexity */
/* eslint-disable max-depth */
import { Cheerio, CheerioAPI } from 'cheerio';
import { ElementType } from 'domelementtype';
import { Element } from 'domhandler';
import { IJournal, IPaginatedResponse, ISubmission, ISubmissionPreview, IUser, IUserPreview } from './models';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PageParser {
    private static readonly USER_ID_REGEX = /\/user\/([^/]+)(\/|$)/;
    private static readonly SUBMISSION_ID_REGEX = /\/view\/([^/]+)(\/|$)/;
    private static readonly STRIP_TRAILING_SLASHES = /\/+$/;
    private static readonly STRIP_INVISIBLE_WHITESPACE_PRE = /\s+/g;
    private static readonly STRIP_INVISIBLE_WHITESPACE_POST = /([\n ]) +/g;
    private static readonly QUOTE_NAME_SUFFIX = 'wrote:';

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
            uploaded: PageParser.parseFADate($('span.popup_date').first().attr('title')?.trim()),
        };
    }

    public static parseJournal($: CheerioAPI): Omit<IJournal, 'id'> {
        return {
            title: $('div.journal-title').text().trim(),
            author: PageParser.parseUserAnchor($('userpage-nav-avatar a'), $('h1 username')),
            content: PageParser.parseHTMLUserContent($, $('div.journal-content')),
            uploaded: PageParser.parseFADate($('span.popup_date').first().attr('title')?.trim()),
        };
    }

    public static parsesUserPage($: CheerioAPI, reqUrl: URL): IUser {
        const avatar = $('userpage-nav-avatar img').attr('src');
        const userPreview = PageParser.parseUserAnchor($('userpage-nav-avatar a'), $('h1 username'));
        if (!userPreview) {
            throw new Error(`Could not parse user preview for user page at ${reqUrl.href}`);
        }

        const userTitle = $('username.user-title').text().trim().split('|');
        const userType = userTitle[0]?.trim() ?? '';
        const registered = PageParser.parseFADate(userTitle[1]?.trim());

        return {
            ...userPreview,
            avatar: avatar ? new URL(avatar, reqUrl) : undefined,
            profile: PageParser.parseHTMLUserContent($, $('div.userpage-profile')),
            userType,
            registered,
        };
    }

    public static parseUserAnchor(elem: Cheerio<Element>, nameElem?: Cheerio<Element>): IUserPreview | undefined {
        const id = PageParser.USER_ID_REGEX.exec(elem.attr('href') ?? '')?.[1];
        if (!id) {
            return undefined;
        }

        let name = (nameElem ?? elem).text().trim();
        if (/\W/.test(name)) {
            name = name.slice(1);
        }

        return {
            id,
            name,
        };
    }

    public static parseSubmissionAnchor(elem: Cheerio<Element>): string | undefined {
        return PageParser.SUBMISSION_ID_REGEX.exec(elem.attr('href') ?? '')?.[1];
    }

    public static parseSubmissionFigure(reqUrl: URL, elem: Cheerio<Element>): ISubmissionPreview {
        const figCaption = elem.find('figcaption');
        return {
            id: PageParser.parseSubmissionAnchor(elem.find('a')) ?? '',
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

    private static parseFADate(date: string | undefined): Date {
        if (!date) {
            throw new Error('No date provided');
        }
        return new Date(date); // TODO: Timezone?
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
                addToResult(child.data.replace(PageParser.STRIP_INVISIBLE_WHITESPACE_PRE, ' '));
                continue;
            }

            if (child.type !== ElementType.Tag) {
                continue;
            }

            const childCheerio = $(child);
            let handled = false;

            switch (child.tagName.toLowerCase()) {
                case 'br':
                    result += '\n'; // Do not call addToResult as this never gets whitespaces
                    handled = true;
                    break;
                case 'a':
                    if (childCheerio.hasClass('iconusername')) {
                        const hasUsernameSuffix = !!childCheerio.text().trim();
                        const userPreview = PageParser.parseUserAnchor(childCheerio);
                        addToResult(hasUsernameSuffix ? `:icon${userPreview?.name}:` : `:${userPreview?.name}icon:`);
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('linkusername')) {
                        const userPreview = PageParser.parseUserAnchor(childCheerio);
                        addToResult(`:link${userPreview?.name}:`);
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('named_url')) {
                        addToResult(
                            `[url=${childCheerio.attr('href')}]${PageParser.parseHTMLUserContent($, childCheerio)}[/url]`,
                        );
                        handled = true;
                        break;
                    }

                    break;
                case 'strong':
                case 'code':
                case 'span':
                case 'sup':
                case 'sub':
                case 'u':
                case 'b':
                case 's':
                case 'i':
                case 'h1':
                case 'h2':
                case 'h3':
                case 'h4':
                case 'h5':
                case 'h6':
                case 'p':
                case 'div':
                    if (childCheerio.hasClass('bbcode')) {
                        const style = childCheerio.css('color');
                        if (style) {
                            addToResult(`[color=${style}]${PageParser.parseHTMLUserContent($, childCheerio)}[/color]`);
                            handled = true;
                            break;
                        }

                        if (childCheerio.hasClass('bbcode_quote')) {
                            const nameEle = childCheerio.find('.bbcode_quote_name');
                            let authorName = nameEle.text().trim();
                            if (authorName.endsWith(PageParser.QUOTE_NAME_SUFFIX)) {
                                authorName = authorName.slice(0, -PageParser.QUOTE_NAME_SUFFIX.length).trim();
                            }
                            nameEle.remove();
                            if (authorName) {
                                addToResult(
                                    `[quote=${authorName}]${PageParser.parseHTMLUserContent($, childCheerio)}[/quote]`,
                                );
                            } else {
                                addToResult(`[quote]${PageParser.parseHTMLUserContent($, childCheerio)}[/quote]`);
                            }
                            handled = true;
                            break;
                        }

                        for (const tagType of [
                            'b',
                            'i',
                            'u',
                            's',
                            'sup',
                            'sub',
                            'center',
                            'right',
                            'left',
                            'h1',
                            'h2',
                            'h3',
                            'h4',
                            'h5',
                            'h6',
                        ]) {
                            if (!childCheerio.hasClass(`bbcode_${tagType}`)) {
                                continue;
                            }

                            addToResult(`[${tagType}]${PageParser.parseHTMLUserContent($, childCheerio)}[/${tagType}]`);
                            handled = true;
                            break;
                        }

                        break;
                    }

                    if (childCheerio.hasClass('parsed_nav_links')) {
                        const prevLink =
                            PageParser.parseSubmissionAnchor(childCheerio.find('a:contains("PREV")')) ?? '-';
                        const firstLink =
                            PageParser.parseSubmissionAnchor(childCheerio.find('a:contains("FIRST")')) ?? '-';
                        const nextLink =
                            PageParser.parseSubmissionAnchor(childCheerio.find('a:contains("NEXT")')) ?? '-';

                        addToResult(`[${prevLink},${firstLink},${nextLink}]`);

                        handled = true;
                        break;
                    }

                    break;
                case 'hr':
                    result += '\n-----\n';
                    handled = true;
                    break;
            }

            if (handled) {
                continue;
            }

            throw new Error(`Unhandled element: ${childCheerio.toString()}`);
        }

        return result.replace(PageParser.STRIP_INVISIBLE_WHITESPACE_POST, '$1').trim();
    }
}
