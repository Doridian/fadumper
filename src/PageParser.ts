/* eslint-disable complexity */
/* eslint-disable max-depth */
import { Cheerio, CheerioAPI } from 'cheerio';
import { ElementType } from 'domelementtype';
import { Element } from 'domhandler';
import {
    IJournal,
    IPaginatedResponse,
    ISubmission,
    ISubmissionPreview,
    IUser,
    IUserPreview,
    IUserTextContent,
} from './models';

const isFurAffinityUrl = (url: URL): boolean => url.host === 'www.furaffinity.net' || url.host === 'furaffinity.net';

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

    public static parseSubmission($: CheerioAPI, reqUrl: URL): Omit<ISubmission, 'id'> {
        const imgElement = $('img#submissionImg');

        return {
            thumbnail: new URL(imgElement.attr('data-preview-src') ?? '', reqUrl),
            title: $('div.submission-title').text().trim(),
            uploader: PageParser.parseUserAnchor(reqUrl, $('div.submission-id-sub-container a')),
            imageURL: new URL(imgElement.attr('data-fullview-src') ?? '', reqUrl),
            description: PageParser.parseHTMLUserContent($, $('div.submission-description'), reqUrl),
            category: $('span.category-name').first().text().trim(),
            type: $('span.type-name').first().text().trim(),
            species: $('strong.highlight:contains("Species") + span').first().text().trim(),
            gender: $('strong.highlight:contains("Gender") + span').first().text().trim(),
            createdAt: PageParser.parseFADate($('span.popup_date').first().attr('title')?.trim()),
        };
    }

    public static parseJournal($: CheerioAPI, reqUrl: URL): Omit<IJournal, 'id'> {
        return {
            title: $('div.journal-title').text().trim(),
            author: PageParser.parseUserAnchor(reqUrl, $('userpage-nav-avatar a'), $('h1 username')),
            content: PageParser.parseHTMLUserContent($, $('div.journal-content'), reqUrl),
            createdAt: PageParser.parseFADate($('span.popup_date').first().attr('title')?.trim()),
        };
    }

    public static parsesUserPage($: CheerioAPI, reqUrl: URL): IUser {
        const avatar = $('userpage-nav-avatar img').attr('src');
        const userPreview = PageParser.parseUserAnchor(reqUrl, $('userpage-nav-avatar a'), $('h1 username'));

        const userTitle = $('username.user-title').text().trim().split('|');
        const userType = userTitle[0]?.trim() ?? '';
        const createdAt = PageParser.parseFADate(userTitle[1]?.trim());

        return {
            ...userPreview,
            avatar: avatar ? new URL(avatar, reqUrl) : undefined,
            description: PageParser.parseHTMLUserContent($, $('div.userpage-profile'), reqUrl),
            type: userType,
            createdAt,
        };
    }

    public static parseUserAnchor(reqUrl: URL, elem: Cheerio<Element>, nameElem?: Cheerio<Element>): IUserPreview {
        const id = PageParser.USER_ID_REGEX.exec(new URL(elem.attr('href') ?? '', reqUrl).pathname)?.[1];
        if (!id) {
            throw new Error('Could not parse user anchor');
        }

        let name = (nameElem ?? elem).text();
        if (!name) {
            name = (nameElem ?? elem).find('img').attr('alt') ?? '';
        }
        name = name.trim();
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
            uploader: PageParser.parseUserAnchor(reqUrl, figCaption.find('p:last a')),
        };
    }

    public static parseJournalSection($: CheerioAPI, elem: Cheerio<Element>, reqUrl: URL): IJournal {
        return {
            id: elem.attr('id')?.replace('jid:', '') ?? '',
            title: elem.find('.section-header h2').text().trim(),
            createdAt: PageParser.parseFADate(elem.find('.popup_date').attr('title')?.trim()),
            content: PageParser.parseHTMLUserContent($, elem.find('.journal-body'), reqUrl),
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

    private static parseHTMLUserContent($: CheerioAPI, elem: Cheerio<Element>, reqUrl: URL): IUserTextContent {
        const content: IUserTextContent = {
            text: '',
            refersToUsers: new Set(),
            refersToSubmissions: new Set(),
            refersToJournals: new Set(),
        };
        PageParser.parseHTMLUserContentInner($, elem, reqUrl, content);
        return content;
    }

    private static parseHTMLUserContentInner(
        $: CheerioAPI,
        elem: Cheerio<Element>,
        reqUrl: URL,
        content: IUserTextContent,
    ): void {
        const addToResult = (str: string) => {
            const endsWithSpace = str.endsWith(' ');
            content.text +=
                (!content.text.endsWith(' ') && str.startsWith(' ') ? ' ' : '') +
                str.trim() +
                (endsWithSpace ? ' ' : '');
        };

        const checkLinkToAdd = (link: URL) => {
            if (!isFurAffinityUrl(link)) {
                return;
            }

            const spl = link.pathname.split('/');
            switch (spl[0]) {
                case 'user':
                case 'gallery':
                case 'scraps':
                case 'journals':
                case 'favorites':
                case 'commissions':
                case 'stats':
                    content.refersToUsers.add({ id: spl[1] ?? '', name: '' });
                    break;
                case 'view':
                    content.refersToSubmissions.add({ id: spl[1] ?? '' });
                    break;
                case 'journal':
                    content.refersToJournals.add({ id: spl[1] ?? '' });
                    break;
                default:
                    break;
            }
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
                    content.text += '\n'; // Do not call addToResult as this never gets whitespaces
                    handled = true;
                    break;
                case 'a':
                    if (childCheerio.hasClass('iconusername')) {
                        const hasUsernameSuffix = !!childCheerio.text().trim();
                        const userPreview = PageParser.parseUserAnchor(reqUrl, childCheerio);
                        content.refersToUsers.add(userPreview);
                        addToResult(hasUsernameSuffix ? `:icon${userPreview.name}:` : `:${userPreview.name}icon:`);
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('linkusername')) {
                        const userPreview = PageParser.parseUserAnchor(reqUrl, childCheerio);
                        content.refersToUsers.add(userPreview);
                        addToResult(`:link${userPreview.name}:`);
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('named_url') || childCheerio.hasClass('auto_link')) {
                        addToResult(`[url=${childCheerio.attr('href')}]`);
                        checkLinkToAdd(new URL(childCheerio.attr('href') ?? '', reqUrl));
                        PageParser.parseHTMLUserContentInner($, childCheerio, reqUrl, content);
                        addToResult('[/url]');
                        handled = true;
                        break;
                    }

                    break;
                case 'wbr':
                    handled = true;
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
                            addToResult(`[color=${style}]`);
                        }

                        if (childCheerio.hasClass('bbcode_quote')) {
                            const nameEle = childCheerio.find('.bbcode_quote_name');
                            let authorName = nameEle.text().trim();
                            if (authorName.endsWith(PageParser.QUOTE_NAME_SUFFIX)) {
                                authorName = authorName.slice(0, -PageParser.QUOTE_NAME_SUFFIX.length).trim();
                            }
                            nameEle.remove();
                            if (authorName) {
                                addToResult(`[quote=${authorName}]`);
                            } else {
                                addToResult('[quote]');
                            }
                            PageParser.parseHTMLUserContentInner($, childCheerio, reqUrl, content);
                            addToResult('[/quote]');
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
                            'spoiler',
                        ]) {
                            if (!childCheerio.hasClass(`bbcode_${tagType}`)) {
                                continue;
                            }

                            addToResult(`[${tagType}]`);
                            PageParser.parseHTMLUserContentInner($, childCheerio, reqUrl, content);
                            addToResult(`[/${tagType}]`);
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

                        if (prevLink !== '-') {
                            content.refersToSubmissions.add({ id: prevLink });
                        }

                        if (firstLink !== '-') {
                            content.refersToSubmissions.add({ id: firstLink });
                        }

                        if (nextLink !== '-') {
                            content.refersToSubmissions.add({ id: nextLink });
                        }

                        addToResult(`[${prevLink},${firstLink},${nextLink}]`);

                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('youtubeWrapper')) {
                        const videoId = childCheerio.find('iframe').attr('src')?.split('/').pop()?.split('?')[0];
                        if (videoId) {
                            addToResult(`[yt]${videoId}[/yt]`);
                        }
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('smilie')) {
                        // TODO: Actually handle smilies
                        handled = true;
                        break;
                    }

                    break;
                case 'hr':
                    content.text += '\n-----\n';
                    handled = true;
                    break;
            }

            if (handled) {
                continue;
            }

            throw new Error(`Unhandled element: ${childCheerio.toString()}`);
        }

        content.text = content.text.replace(PageParser.STRIP_INVISIBLE_WHITESPACE_POST, '$1').trim();
    }
}
