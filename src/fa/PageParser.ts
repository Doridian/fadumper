/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/* eslint-disable max-depth */
import { Cheerio, CheerioAPI } from 'cheerio';
import { ElementType } from 'domelementtype';
import { Element } from 'domhandler';
import { logger } from '../lib/log.js';
import {
    IJournal,
    IPaginatedResponse,
    ISubmission,
    ISubmissionPreview,
    IUser,
    IUserPreview,
    IUserTextContent,
} from './models.js';

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

        const tags = new Set<string>();

        $('section.tags-row span.tags a').each((_, elem) => {
            tags.add($(elem).text().trim());
        });

        const imageSrc = $('a.button:contains("Download")').attr('href');
        if (!imageSrc) {
            throw new Error('No image source found');
        }

        const thumbSrc = imgElement.attr('data-preview-src');

        return {
            thumbnail: thumbSrc ? new URL(thumbSrc, reqUrl) : undefined,
            title: $('div.submission-title').text().trim(),
            createdBy: PageParser.parseUserAnchor(reqUrl, $('div.submission-id-sub-container a')),
            image: new URL(imageSrc, reqUrl),
            description: PageParser.parseHTMLUserContent($, $('div.submission-description'), reqUrl),
            category: $('span.category-name').first().text().trim(),
            type: $('span.type-name').first().text().trim(),
            species: $('strong.highlight:contains("Species") + span').first().text().trim(),
            gender: $('strong.highlight:contains("Gender") + span').first().text().trim(),
            createdAt: PageParser.parseFADate($('span.popup_date').first().attr('title')?.trim()),
            tags,
        };
    }

    public static parseJournal($: CheerioAPI, reqUrl: URL): Omit<IJournal, 'id'> {
        return {
            title: $('div.journal-title').text().trim(),
            createdBy: PageParser.parseUserAnchor(reqUrl, $('userpage-nav-avatar a'), $('h1 username')),
            description: PageParser.parseHTMLUserContent($, $('div.journal-content'), reqUrl),
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
        const id = PageParser.USER_ID_REGEX.exec(new URL(elem.attr('href') ?? '', reqUrl).pathname.toLowerCase())?.[1];
        if (!id) {
            throw new Error(`Could not parse user anchor: ${elem.toString()}`);
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
            id: Number.parseInt(PageParser.parseSubmissionAnchor(elem.find('a')) ?? 'x', 10),
            thumbnail: new URL(elem.find('img').attr('src') ?? '', reqUrl),
            title: figCaption.find('p:first').text().trim(),
            createdBy: PageParser.parseUserAnchor(reqUrl, figCaption.find('p:last a')),
        };
    }

    public static parseJournalSection($: CheerioAPI, elem: Cheerio<Element>, reqUrl: URL): Omit<IJournal, 'createdBy'> {
        return {
            id: Number.parseInt(elem.attr('id')?.replace('jid:', '') ?? 'X', 10),
            title: elem.find('.section-header h2').text().trim(),
            createdAt: PageParser.parseFADate(elem.find('.popup_date').attr('title')?.trim()),
            description: PageParser.parseHTMLUserContent($, elem.find('.journal-body'), reqUrl),
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

            // Links always start with a slash
            const [linkType, linkID] = link.pathname.slice(1).split('/');
            if (!linkType || !linkID) {
                return;
            }

            switch (linkType) {
                case 'user':
                case 'gallery':
                case 'scraps':
                case 'journals':
                case 'favorites':
                case 'commissions':
                case 'stats':
                    content.refersToUsers.add(linkID);
                    break;
                case 'view':
                    content.refersToSubmissions.add(Number.parseInt(linkID, 10));
                    break;
                case 'journal':
                    content.refersToJournals.add(Number.parseInt(linkID, 10));
                    break;
                default:
                    break;
            }
        };

        const checkLinkToAddSafe = (link: string | undefined) => {
            if (!link) {
                return;
            }

            let url;
            try {
                url = new URL(link, reqUrl);
            } catch {
                return;
            }

            checkLinkToAdd(url);
        };

        const parseUserAnchorSafe = (childCheerio: Cheerio<Element>): IUserPreview => {
            let userPreview;
            try {
                userPreview = PageParser.parseUserAnchor(reqUrl, childCheerio);
            } catch {
                return {
                    id: '',
                    name: childCheerio.text().trim(),
                };
            }

            content.refersToUsers.add(userPreview.id);
            return userPreview;
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
                        const userPreview = parseUserAnchorSafe(childCheerio);
                        addToResult(hasUsernameSuffix ? `:icon${userPreview.name}:` : `:${userPreview.name}icon:`);
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('linkusername')) {
                        const userPreview = parseUserAnchorSafe(childCheerio);
                        addToResult(`:link${userPreview.name}:`);
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('named_url') || childCheerio.hasClass('auto_link')) {
                        const href = childCheerio.attr('href');
                        checkLinkToAddSafe(href);
                        addToResult(`[url=${href}]`);
                        PageParser.parseHTMLUserContentInner($, childCheerio, reqUrl, content);
                        addToResult('[/url]');
                        handled = true;
                        break;
                    }

                    handled = true;
                    logger.warn('Unhandled link: %s', childCheerio.toString());
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
                    // These footers are silly
                    if (childCheerio.hasClass('submission-footer')) {
                        handled = true;
                        break;
                    }

                    if (childCheerio.hasClass('bbcode')) {
                        const style = childCheerio.css('color');
                        if (style) {
                            addToResult(`[color=${style}]`);
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
                                addToResult(`[quote=${authorName}]`);
                            } else {
                                addToResult('[quote]');
                            }
                            PageParser.parseHTMLUserContentInner($, childCheerio, reqUrl, content);
                            addToResult('[/quote]');
                            handled = true;
                            break;
                        }

                        const allBBCodeTags = new Set<string>();
                        for (const className of childCheerio.attr('class')?.split(' ') ?? []) {
                            const match = /^bbcode_(.+)$/.exec(className);
                            const tag = match?.[1];
                            if (tag) {
                                allBBCodeTags.add(tag.toLowerCase());
                            }
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
                            if (!allBBCodeTags.has(tagType)) {
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
                            content.refersToSubmissions.add(Number.parseInt(prevLink, 10));
                        }

                        if (firstLink !== '-') {
                            content.refersToSubmissions.add(Number.parseInt(firstLink, 10));
                        }

                        if (nextLink !== '-') {
                            content.refersToSubmissions.add(Number.parseInt(nextLink, 10));
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
                        // Ignore smilies, they are not useful as metadata anyway
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
