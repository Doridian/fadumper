import { SingleInstance } from '@doridian/single-instance';
import { Client as ESClient } from '@elastic/elasticsearch';
import { BulkOperationContainer, BulkUpdateAction, SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { ArgumentParser } from 'argparse';
import { configDotenv } from 'dotenv';
import { ESItem, IDBDownloadable, IDBSubmission, IDBUser } from '../db/models.js';
import { DownloadableFile } from '../fa/Downloadable.js';
import { RawAPI } from '../fa/RawAPI.js';
import { logger } from '../lib/log.js';
import { downloadOne, FileDeleted, getNumericValue } from '../lib/utils.js';

configDotenv();

const argParse = new ArgumentParser({
    description: 'FA downloadfiles',
});
argParse.add_argument('-t', '--type', { default: 'submission' });
argParse.add_argument('-l', '--looper', { action: 'store_true' });
const ARGS = argParse.parse_args() as { type: 'submission' | 'user'; looper: boolean };

const lockMutex = new SingleInstance(`fadumper_downloadfiles_${ARGS.type}`);

interface QueueEntry {
    downloads: DownloadableFile[];
    item: ESItem<IDBDownloadable>;
}

type ESBulkType = BulkOperationContainer | BulkUpdateAction;

const queue: QueueEntry[] = [];
let esQueue: ESBulkType[] = [];
let doneCount = 0;
let errorCount = 0;
let foundCount = 0;
let skippedCount = 0;
let successCount = 0;
let totalCount = 0;

const MAX_PARALLEL = Number.parseInt(process.env.DOWNLOADFILES_CONCURRENCY ?? '10', 10);
const ES_BATCH_SIZE = 1000;

const EXIT_ERROR_IF_FOUND = !!ARGS.looper;

let inProgress = 0;
let esDone = false;

const client = new ESClient({
    node: process.env.ES_URL,
});

const faRawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);

const mustNot = [{ term: { downloaded: true } }, { term: { deleted: true } }];

const RES_SKIP = 'skipped';

const gotFiles = new Set<string>();

function setHadErrors() {
    process.exitCode = 1;
}

function printStats() {
    logger.info(
        'Total: %i Queue: %i Done: %i Success: %i Failed: %i Skipped: %i Percent: %i',
        totalCount,
        queue.length,
        doneCount,
        successCount,
        errorCount,
        skippedCount,
        Math.floor((doneCount / totalCount) * 100),
    );
}
printStats();
let scanInterval: NodeJS.Timeout | undefined = setInterval(printStats, 10_000);

const ES_BATCH_SIZE_2 = ES_BATCH_SIZE * 2;
async function esRunBatchUpdate(min: number) {
    if (esQueue.length < min) {
        return;
    }
    const todo = esQueue;
    esQueue = [];

    try {
        await client.bulk({
            operations: todo,
        });
        logger.info('Processed %i batched updates', todo.length / 2);
    } catch (error) {
        logger.error('Error processing batched updates: %s', error);
        setHadErrors();
    }
}

function handleError(error: Error) {
    logger.error('Error %s', error);
    setHadErrors();
}

let batcherInterval: NodeJS.Timeout | undefined = setInterval(() => {
    esRunBatchUpdate(ES_BATCH_SIZE_2).catch(handleError);
}, 1000);

async function checkEnd() {
    if (queue.length > 0 || inProgress > 0 || !esDone) {
        return;
    }

    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = undefined;
    }

    if (batcherInterval) {
        clearInterval(batcherInterval);
        batcherInterval = undefined;
    }

    await esRunBatchUpdate(1);
}

async function addSubmission(submission: ESItem<IDBSubmission>) {
    await addURL(submission, [submission._source.image, submission._source.thumbnail]);
}

async function addUser(user: ESItem<IDBUser>) {
    if (!user._source.avatar) {
        return;
    }

    await addURL(user, [user._source.avatar]);
}

async function addURL(item: ESItem<IDBDownloadable>, urls: string[]) {
    const entry: QueueEntry = {
        item,
        downloads: urls.filter((url) => !!url).map((url) => new DownloadableFile(faRawAPI, url)),
    };

    if (
        entry.downloads.length < 1 ||
        (await Promise.all(entry.downloads.map(async (dl) => dl.isDownloaded()))).every(Boolean)
    ) {
        inProgress++;
        await downloadDone(entry, RES_SKIP);
        return;
    }

    for (const dl of entry.downloads) {
        gotFiles.add(dl.localPath);
    }

    queue.push(entry);
    setImmediate(() => {
        downloadNext().catch(handleError);
    });
}

async function downloadDone(entry: QueueEntry, success: boolean | 'skipped', fileDeleted = false, fileHash?: string) {
    if (success === RES_SKIP) {
        skippedCount++;
    } else if (success) {
        successCount++;
    } else {
        errorCount++;
    }
    doneCount++;
    inProgress--;

    setImmediate(() => {
        downloadNext().catch(handleError);
    });

    const doc: {
        downloaded?: boolean;
        deleted?: boolean;
        hash?: string;
    } = {};
    if (success) {
        doc.downloaded = true;
        if (fileHash) {
            doc.hash = fileHash;
        }
    } else if (fileDeleted) {
        doc.deleted = true;
    } else {
        return;
    }

    esQueue.push(
        {
            update: {
                _index: entry.item._index,
                _id: entry.item._id,
            },
        },
        {
            doc,
        },
    );

    await checkEnd();
}

async function downloadNext(): Promise<void> {
    if (inProgress >= MAX_PARALLEL) {
        return;
    }

    const entry = queue.pop();
    if (!entry) {
        return;
    }
    inProgress++;

    try {
        const results = await Promise.all(entry.downloads.map(downloadOne));
        const [mainResult] = results;
        const mainResultDeleted = mainResult === FileDeleted;
        const mainResultHash = typeof mainResult === 'string';
        await downloadDone(
            entry,
            mainResultHash ? true : 'skipped',
            mainResultDeleted,
            mainResultHash ? mainResult : undefined,
        );
    } catch (error) {
        logger.error('Error on %s: %s', error, entry);
        setHadErrors();
        await downloadDone(entry, false);
    }
}

async function getMoreUntilDone(response: SearchResponse): Promise<boolean> {
    totalCount = getNumericValue(response.hits.total);

    if (totalCount > 0 && EXIT_ERROR_IF_FOUND && !process.exitCode) {
        process.exitCode = 2;
    }

    // collect all the records
    const promises: Promise<void>[] = [];
    for (const hit of response.hits.hits) {
        foundCount++;
        switch (ARGS.type) {
            case 'submission':
                promises.push(addSubmission(hit as ESItem<IDBSubmission>));
                break;
            case 'user':
                promises.push(addUser(hit as ESItem<IDBUser>));
                break;
            default:
                throw new Error('Unknown type');
        }
    }
    await Promise.all(promises);

    if (totalCount === foundCount) {
        logger.info('Queued all ES entries: %i', foundCount);
        esDone = true;
        await checkEnd();
        return false;
    }

    return true;
}

async function main() {
    let response = await client.search({
        index: `fa_${ARGS.type}s`,
        scroll: '60s',
        body: {
            size: ES_BATCH_SIZE,
            query: {
                bool: {
                    must_not: mustNot,
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

async function safeMain() {
    await lockMutex.lock();

    try {
        await main();
    } catch (error) {
        logger.error('ES scan error, setting early exit: %s', error);
        esDone = true;
        setHadErrors();
    }

    try {
        await checkEnd();
    } catch (error) {
        logger.error('Error on checkEnd: %s', error);
        setHadErrors();
    }

    await lockMutex.unlock();
}

await safeMain();
