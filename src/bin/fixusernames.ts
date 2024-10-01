import { Client as ESClient } from '@elastic/elasticsearch';
import { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { configDotenv } from 'dotenv';
import { ESItem, IDBSubmission } from '../db/models.js';
import { Client } from '../fa/Client.js';
import { RawAPI } from '../fa/RawAPI.js';
import { logger } from '../lib/log.js';
import { getNumericValue } from '../lib/utils.js';

configDotenv();

const client = new ESClient({
    node: process.env.ES_URL,
});
const ES_BATCH_SIZE = 1000;

const faRawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);
const faClient = new Client(faRawAPI);

const handledUsernames = new Set<string>();

async function getMoreUntilDone(response: SearchResponse): Promise<boolean> {
    logger.info('Processing %d (total = %d)', response.hits.hits.length, getNumericValue(response.hits.total));

    for (const hit of response.hits.hits) {
        const typedHit = hit as ESItem<IDBSubmission>;

        if (handledUsernames.has(typedHit._source.createdBy)) {
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const subData = await faClient.getSubmission(typedHit._source.id);

        logger.info(
            'Rewriting user %s to username %s -> %s',
            typedHit._source.createdBy,
            typedHit._source.createdByUsername,
            subData.createdBy.name,
        );

        // eslint-disable-next-line no-await-in-loop
        await client.updateByQuery({
            index: 'fa_submissions',
            body: {
                script: {
                    source: 'ctx._source.createdByUsername = params.newUsername;',
                    lang: 'painless',
                    params: {
                        newUsername: subData.createdBy.name,
                    },
                },
                query: {
                    term: {
                        bool: {
                            must: {
                                term: {
                                    createdBy: typedHit._source.createdBy,
                                },
                            },
                        },
                    },
                },
            },
        });

        handledUsernames.add(typedHit._source.createdBy);
    }

    return false;
}

async function main() {
    let response = await client.search({
        index: 'fa_submissions',
        scroll: '60s',
        body: {
            size: ES_BATCH_SIZE,
            query: {
                bool: {
                    must: {
                        script: {
                            script: "doc['createdBy'].value.length() != doc['createdByUsername'].value.length()",
                        },
                    },
                },
            },
        },
    });

    // eslint-disable-next-line no-await-in-loop
    while (await getMoreUntilDone(response)) {
        // eslint-disable-next-line no-await-in-loop
        response = await client.scroll({
            scroll_id: response._scroll_id,
            scroll: '60s',
        });
    }
}

await main();
