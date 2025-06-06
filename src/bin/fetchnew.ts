import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SingleInstance } from '@doridian/single-instance';
import { Client as ESClient } from '@elastic/elasticsearch';
import { ArgumentParser } from 'argparse';
import { configDotenv } from 'dotenv';
import pLimit from 'p-limit';
import { IDBJournal, IDBSubmission } from '../db/models.js';
import { Client as FAClient } from '../fa/Client.js';
import { DOWNLOAD_PATH } from '../fa/Downloadable.js';
import { HttpError, RawAPI } from '../fa/RawAPI.js';
import { IUserPreview } from '../fa/models.js';
import { logger } from '../lib/log.js';
import { getNumericValue } from '../lib/utils.js';

configDotenv();

const argParse = new ArgumentParser({
    description: 'FA fetchnew',
});
argParse.add_argument('-t', '--type', { default: 'submission' });
argParse.add_argument('-l', '--looper', { action: 'store_true' });
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ARGS = argParse.parse_args() as { type: 'journal' | 'submission' | 'user' };

const FETCH_ONE_OVERRIDE = process.env.FETCHNEW_FETCH_ONE_OVERRIDE ?? '';

const PER_FETCH_LIMIT = Number.parseInt(process.env.FETCHNEW_PER_FETCH_LIMIT ?? '10', 10);
const limiter = pLimit(Number.parseInt(process.env.FETCHNEW_CONCURRENCY ?? '1', 10));
const POST_AGE_MIN_MS = Number.parseInt(process.env.FETCHNEW_POST_AGE_MIN_SECONDS ?? '86400', 10) * 1000;

const lockMutex = new SingleInstance(`fadumper_fetchnew_${ARGS.type}`);

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
    doc: { id: number };
}

type ESQueueEntry = ESBulkOperation<string> | ESPostDoc;

async function getMaxID(faType: FetchNewWithIDType) {
    let maxId = -1;
    try {
        maxId = Number.parseInt(
            (await readFile(path.join(DOWNLOAD_PATH, `${faType}s.max-id`))).toString('utf8').trim(),
            10,
        );
    } catch (error) {
        logger.error('Error loading maxId file:', error);
    }

    if (maxId <= 0) {
        const maxIdRes = await client.search({
            index: `fa_${faType}s`,
            aggregations: {
                max_id: {
                    max: {
                        field: 'id',
                    },
                },
            },
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        maxId = getNumericValue(maxIdRes.aggregations?.max_id as number | undefined);
    }

    if (maxId < 0) {
        maxId = 0;
    }

    logger.info('Starting with %s (end = %i)', faType, maxId);
    return maxId;
}

async function setMaxID(faType: FetchNewWithIDType, maxId: number) {
    await writeFile(path.join(DOWNLOAD_PATH, `${faType}s.max-id`), maxId.toString());
}

async function loopType(faType: FetchNewWithIDType) {
    let maxId = await getMaxID(faType);

    const knownLastId = faType === 'submission' && !FETCH_ONE_OVERRIDE ? await faClient.getMaxSubmissionID() : -1;

    let hitTooNewPost = false;
    const doHitTooNewPost = () => {
        hitTooNewPost = true;
    };
    const hasHitTooNewPost = () => hitTooNewPost;

    while (true) {
        const idRangeMin = maxId + 1;
        let idRangeMax = maxId + PER_FETCH_LIMIT;
        if (knownLastId > 0 && idRangeMax > knownLastId) {
            idRangeMax = knownLastId;
        }
        if (idRangeMax < idRangeMin) {
            logger.info('Reached end (start batch) %i / %i', knownLastId, maxId);
            break;
        }

        logger.info('Next %s batch %i - %i (end = %i)', faType, idRangeMin, idRangeMax, knownLastId);
        maxId = idRangeMax;

        const pageQueue: ESQueueEntry[] = [];

        let maxFoundId = -1;

        const fetchOne = async (i: number) => {
            if (hasHitTooNewPost() && i > maxFoundId) {
                logger.info('Ignoring %s %i because hit too new post with lower ID', faType, i);
                return;
            }

            logger.info('Fetching %s %i', faType, i);
            let doc: { id: number; createdAt: Date };
            try {
                switch (faType) {
                    case 'journal': {
                        const journal = await faClient.getJournal(i);
                        const dbJournal: Omit<IDBJournal, 'deleted' | 'downloaded' | 'hash'> = {
                            ...journal,
                            createdBy: journal.createdBy.id,
                            createdByUsername: journal.createdBy.name,
                            description: journal.description.text,
                            descriptionRefersToJournals: [...journal.description.refersToJournals],
                            descriptionRefersToSubmissions: [...journal.description.refersToSubmissions],
                            descriptionRefersToUsers: [...journal.description.refersToUsers],
                            refreshedAt: new Date(),
                        };
                        doc = dbJournal;
                        break;
                    }
                    case 'submission': {
                        const submission = await faClient.getSubmission(i);
                        const dbSubmission: Omit<IDBSubmission, 'deleted' | 'downloaded' | 'hash'> = {
                            ...submission,
                            file: submission.file.href,
                            thumbnail: submission.thumbnail?.href ?? '',
                            tags: [...submission.tags],
                            createdBy: submission.createdBy.id,
                            createdByUsername: submission.createdBy.name,
                            description: submission.description.text,
                            descriptionRefersToJournals: [...submission.description.refersToJournals],
                            descriptionRefersToSubmissions: [...submission.description.refersToSubmissions],
                            descriptionRefersToUsers: [...submission.description.refersToUsers],
                            refreshedAt: new Date(),
                        };
                        doc = dbSubmission;
                        break;
                    }
                    default:
                        throw new Error('Unknown type');
                }
            } catch (error) {
                if (error instanceof HttpError && error.status === 404) {
                    logger.info('404 on %s %i', faType, i);
                    return;
                }
                logger.error('Error fetching %s %i', faType, i);
                throw error;
            }

            const postAgeMS = Date.now() - doc.createdAt.getTime();
            if (postAgeMS < POST_AGE_MIN_MS) {
                logger.info(
                    'Ignored fetched %s %i because too new (is=%i; min=%i)',
                    faType,
                    i,
                    postAgeMS,
                    POST_AGE_MIN_MS,
                );

                doHitTooNewPost();
                if (maxFoundId >= doc.id) {
                    maxFoundId = doc.id - 1;
                }
                return;
            }

            logger.info('Successfully fetched %s %i', faType, i);

            if (doc.id > maxFoundId && !hasHitTooNewPost()) {
                maxFoundId = doc.id;
            }

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
        };

        if (FETCH_ONE_OVERRIDE) {
            logger.warn('FETCH_ONE_OVERRIDE is set!');
            // eslint-disable-next-line no-await-in-loop
            await fetchOne(Number.parseInt(FETCH_ONE_OVERRIDE, 10));
            if (pageQueue.length <= 0) {
                logger.error('Could not fetch one, exiting');
                break;
            }
        } else {
            const promises: Promise<void>[] = [];
            for (let i = idRangeMin; i <= idRangeMax; i++) {
                promises.push(limiter(async () => fetchOne(i)));
            }
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(promises);
        }

        if (pageQueue.length > 0) {
            // eslint-disable-next-line no-await-in-loop
            const result = await client.bulk({
                body: pageQueue,
            });

            if (result.errors) {
                throw new Error(JSON.stringify(result));
            }

            if (FETCH_ONE_OVERRIDE) {
                logger.warn('Fetched one, exiting');
                break;
            }

            if (maxFoundId > 0) {
                let doBreak = false;
                if (knownLastId > 0 && maxFoundId >= knownLastId) {
                    maxFoundId = knownLastId;
                    doBreak = true;
                }
                // eslint-disable-next-line no-await-in-loop
                await setMaxID(faType, maxFoundId);
                if (doBreak) {
                    logger.info('Reached end (in batch) %i / %i', knownLastId, maxId);
                    break;
                }
            }

            if (hasHitTooNewPost()) {
                logger.info('Hit too new post, stopping');
                break;
            }
        } else if (knownLastId <= 0) {
            logger.info('Empty batch and unknown end. Assuming all %ss were found', faType);
            break;
        } else if (maxId > knownLastId) {
            logger.info('Reached end (empty batch) %i / %i', knownLastId, maxId);
            break;
        }
    }
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
    logger.info('Start user %s is watching %i users', startUser, i);

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

        logger.info('Checking user %s at depth %i', entry.id, entry.depth);
        if (opt.scanOutgoingWatches) {
            i = 0;
            // eslint-disable-next-line no-await-in-loop
            for await (const user of faClient.getWatching(entry.id)) {
                queue.push({ id: user.id, raw: user, depth: entry.depth + 1 });
                i++;
            }
            logger.info('User %s is watching %i users', entry.id, i);
        }
        if (opt.scanIncomingWatches) {
            i = 0;
            // eslint-disable-next-line no-await-in-loop
            for await (const user of faClient.getWatchedBy(entry.id)) {
                queue.push({ id: user.id, raw: user, depth: entry.depth + 1 });
                i++;
            }
            logger.info('User %s is watched by %i users', entry.id, i);
        }
    }

    return visited;
}

async function safeMain() {
    await lockMutex.lock();

    try {
        if (ARGS.type === 'user') {
            if (!process.env.FA_START_USER) {
                throw new Error('Missing or empty FA_START_USER');
            }
            await buildUserGraph(process.env.FA_START_USER, 10, {
                scanIncomingWatches: true,
                scanOutgoingWatches: true,
            });
        } else {
            await loopType(ARGS.type);
        }
    } catch (error) {
        logger.error('Error: %s', error);
        await lockMutex.unlock();
        process.exit(1);
    }

    await lockMutex.unlock();
}

await safeMain();
