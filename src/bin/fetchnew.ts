/* eslint-disable no-console */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client as ESClient } from '@elastic/elasticsearch';
import { IDBDownloadable } from '../db/models';
import { Client as FAClient } from '../fa/Client';
import { FASystemError, RawAPI } from '../fa/RawAPI';
import { IUserPreview } from '../fa/models';
import { getNumericValue } from '../lib/utils';

const DOWNLOADS_PATH = process.env.FA_DOWNLOAD_PATH ?? './downloads';

const client = new ESClient({
    node: process.env.ES_URL,
});

const faRawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);
const faClient = new FAClient(faRawAPI);

type FetchNewWithIDType = 'journal' | 'submission';

interface ESBulkOperation<I extends string> {
    update: {
        _id: string;
        _index: `fa_${I}s`;
        retry_on_conflict: number;
    };
}

interface ESPostDoc {
    doc_as_upsert: true;
    doc: IDBDownloadable;
}

type ESQueueEntry = ESBulkOperation<string> | ESPostDoc;

async function getMaxID(faType: FetchNewWithIDType) {
    let maxId = -1;
    try {
        maxId = Number.parseInt(
            (await readFile(path.join(DOWNLOADS_PATH, `${faType}s.max-id`))).toString('utf8').trim(),
            10,
        );
    } catch (error) {
        console.error('Error loading maxId file:', error);
    }

    if (maxId <= 0) {
        const maxIdRes = await client.search({
            index: `fa_${faType}s`,
            body: {
                aggs: {
                    max_id: {
                        max: {
                            field: 'id',
                        },
                    },
                },
            },
        });
        maxId = getNumericValue(maxIdRes.aggregations?.max_id as number | undefined);
    }

    console.log(`Starting with ${faType} maxId = ${maxId}`);
    return maxId;
}

async function setMaxID(faType: FetchNewWithIDType, maxId: number) {
    await writeFile(path.join(DOWNLOADS_PATH, `${faType}s.max-id`), maxId.toString());
}

async function loopType(faType: FetchNewWithIDType) {
    let maxId = await getMaxID(faType);

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const idRangeMin = maxId + 1;
        const idRangeMax = maxId + 100;
        console.log(`Asking for ${faType} with range = ${idRangeMin} - ${idRangeMax}`);
        maxId = idRangeMax;

        const pageQueue: ESQueueEntry[] = [];

        for (let i = idRangeMin; i < idRangeMax; i++) {
            try {
                // eslint-disable-next-line no-await-in-loop
                let entry: { id: number };
                switch (faType) {
                    case 'journal':
                        // eslint-disable-next-line no-await-in-loop
                        entry = await faClient.getJournal(i);
                        break;
                    case 'submission':
                        // eslint-disable-next-line no-await-in-loop
                        entry = await faClient.getSubmission(i);
                        break;
                    default:
                        throw new Error('Unknown type');
                }
                const doc: { id: number; downloaded: boolean; deleted: boolean } = {
                    downloaded: false,
                    deleted: false,
                    ...entry,
                };

                pageQueue.push(
                    {
                        update: {
                            _id: doc.id.toString(10),
                            _index: `fa_${faType}s`,
                            retry_on_conflict: 3,
                        },
                    },
                    {
                        doc,
                        doc_as_upsert: true,
                    },
                );
            } catch (error) {
                if (
                    error instanceof FASystemError &&
                    error.faMessage === 'The submission you are trying to find is not in our database.'
                ) {
                    continue;
                }
                throw error;
            }
        }

        if (pageQueue.length === 0) {
            console.log(`No more items of type ${faType} found`);
            break;
        }

        // eslint-disable-next-line no-await-in-loop
        const result = await client.bulk({
            body: pageQueue,
        });

        if (result.errors) {
            throw new Error(JSON.stringify(result));
        }
    }

    await setMaxID(faType, maxId);
}

interface IUserGraphQueueEntry {
    id: string;
    raw: IUserPreview;
    depth: number;
}

interface IGraphOptions {
    scanIncomingWatches: boolean;
    scanOutgoingWatches: boolean;
}

async function buildUserGraph(startUser: string, maxDepth: number, opt: IGraphOptions): Promise<Set<string>> {
    const queue: IUserGraphQueueEntry[] = [];
    const visited = new Set<string>();

    let i = 0;
    for await (const user of faClient.getWatching(startUser)) {
        queue.push({ id: user.id, depth: 1, raw: user });
        i++;
    }
    console.log(`Start user ${startUser} is watching ${i} users`);

    while (queue.length > 0) {
        const entry = queue.shift();
        if (entry === undefined) {
            throw new Error('Queue is empty');
        }

        if (visited.has(entry.id)) {
            continue;
        }

        visited.add(entry.id);

        if (entry.depth >= maxDepth) {
            continue;
        }

        console.log('Checking user', entry.id, 'at depth', entry.depth);
        if (opt.scanOutgoingWatches) {
            i = 0;
            // eslint-disable-next-line no-await-in-loop
            for await (const user of faClient.getWatching(entry.id)) {
                queue.push({ id: user.id, raw: user, depth: entry.depth + 1 });
                i++;
            }
            console.log(`User ${entry.id} is watching ${i} users`);
        }
        if (opt.scanIncomingWatches) {
            i = 0;
            // eslint-disable-next-line no-await-in-loop
            for await (const user of faClient.getWatchedBy(entry.id)) {
                queue.push({ id: user.id, raw: user, depth: entry.depth + 1 });
                i++;
            }
            console.log(`User ${entry.id} is watched by ${i} users`);
        }
    }

    return visited;
}

async function safeMain() {
    try {
        await loopType('submission');
        // await loopType('journal');
        console.log(buildUserGraph);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void safeMain();
