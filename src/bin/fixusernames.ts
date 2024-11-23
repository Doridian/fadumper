import { Client as ESClient } from '@elastic/elasticsearch';
import { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { load as cheerioLoad } from 'cheerio';
import { configDotenv } from 'dotenv';
import { ESItem, IDBSubmission } from '../db/models.js';
import { Client } from '../fa/Client.js';
import { FASystemError, RawAPI } from '../fa/RawAPI.js';
import { logger } from '../lib/log.js';
import { assertUsernameToIDValid } from '../lib/useridcheck.js';
import { getNumericValue } from '../lib/utils.js';

configDotenv();

const client = new ESClient({
    node: process.env.ES_URL,
    requestTimeout: 60 * 60 * 1000,
});
const ES_BATCH_SIZE = 100;

const faRawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);
const faClient = new Client(faRawAPI);

const handledUsernames = new Set<string>();
const handledSubmissions = new Set<number>();

const failedUserProfiles = new Set<string>();
async function tryViaUserProfile(userID: string): Promise<string | undefined> {
    if (failedUserProfiles.has(userID)) {
        return undefined;
    }

    try {
        const user = await faClient.getUserpage(userID, true);
        return user.name;
    } catch (error) {
        if (error instanceof FASystemError) {
            const $ = cheerioLoad(error.getRawHTML());
            for (const lnk of $('a')) {
                const { href } = lnk.attribs;
                const text = $(lnk).text();
                if (href?.startsWith('/unwatch/')) {
                    logger.info('Using profile error determine username for %s -> "%s"', userID, text);
                    // eslint-disable-next-line max-depth
                    if (text.toLowerCase().startsWith('unwatch ')) {
                        return text.slice(8);
                    }
                    return text;
                }
            }
        }
        logger.warn('Error fetching user profile %s: %s', userID, error);
        failedUserProfiles.add(userID);
        return undefined;
    }
}

async function getMoreUntilDone(response: SearchResponse): Promise<boolean> {
    logger.info('Processing %d (total = %d)', response.hits.hits.length, getNumericValue(response.hits.total));

    for (const hit of response.hits.hits) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const typedHit = hit as ESItem<IDBSubmission>;

        if (handledUsernames.has(typedHit._source.createdBy)) {
            continue;
        }

        if (handledSubmissions.has(typedHit._source.id)) {
            continue;
        }
        handledSubmissions.add(typedHit._source.id);

        let newUsername;
        try {
            // eslint-disable-next-line no-await-in-loop
            const subData = await faClient.getSubmission(typedHit._source.id);
            newUsername = subData.createdBy.name;
        } catch (error) {
            logger.warn('Error fetching submission %s: %s', typedHit._source.id, error);
            // eslint-disable-next-line no-await-in-loop
            newUsername = await tryViaUserProfile(typedHit._source.createdBy);
        }

        if (!newUsername) {
            logger.warn('Failed to fetch username for user %s', typedHit._source.createdBy);
            continue;
        }

        try {
            assertUsernameToIDValid(typedHit._source.createdBy, newUsername);
        } catch (error) {
            logger.error('Error validating user %s -> %s: %s', typedHit._source.createdBy, newUsername, error);
            continue;
        }

        logger.info(
            'Rewriting user %s to username %s -> %s',
            typedHit._source.createdBy,
            typedHit._source.createdByUsername,
            newUsername,
        );

        // eslint-disable-next-line no-await-in-loop
        await client.updateByQuery({
            index: 'fa_submissions',
            timeout: '1h',
            body: {
                script: {
                    source: 'ctx._source.createdByUsername = params.newUsername;',
                    lang: 'painless',
                    params: {
                        newUsername,
                    },
                },
                query: {
                    bool: {
                        must: {
                            term: {
                                createdBy: typedHit._source.createdBy,
                            },
                        },
                    },
                },
            },
        });

        handledUsernames.add(typedHit._source.createdBy);
    }

    return response.hits.hits.length > 0;
}

async function main() {
    let response: SearchResponse;
    do {
        // eslint-disable-next-line no-await-in-loop
        response = await client.search({
            index: 'fa_submissions',
            timeout: '1h',
            body: {
                size: ES_BATCH_SIZE,
                query: {
                    bool: {
                        must: {
                            script: {
                                script: "doc['createdByUsername'].value.length() < 30 && doc['createdBy'].value.replace('_', '').length() != doc['createdByUsername'].value.replace('_', '').length()",
                            },
                        },
                    },
                },
            },
        });
        // eslint-disable-next-line no-await-in-loop
    } while (await getMoreUntilDone(response));
}

await main();
