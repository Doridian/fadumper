import { createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import { EventEmitter } from 'node:stream';
import { Client } from '@elastic/elasticsearch';
import { BulkOperationContainer, BulkUpdateAction, SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { ArgumentParser } from 'argparse';
import { getNumericValue, mkdirpFor, pathFixer } from '../lib/utils';

const argParse = new ArgumentParser({
    description: 'FA downloadfiles',
});
argParse.add_argument('-t', '--type');
argParse.add_argument('-l', '--looper', { action: 'store_true' });
const ARGS = argParse.parse_args() as { type: string; looper: boolean };

configureDotenv();

interface QueueEntry {
    url?: string;
    size: number;
    id: string;
    downloaded: boolean;
    deleted: boolean;
    dest: string;
}

type ESBulkType = BulkOperationContainer | BulkUpdateAction<ESPost, Partial<ESPost>>;

const queue: QueueEntry[] = [];
let esQueue: ESBulkType[] = [];
let doneCount = 0;
let errorCount = 0;
let foundCount = 0;
let listCount = 0;
let skippedCount = 0;
let successCount = 0;
let totalCount = 0;

const agent = new Agent({ keepAlive: true });

const DOWNLOAD_KIND = ARGS.type;
const DEST_FOLDER = process.env.FA_DOWNLOAD_PATH;
const MAX_PARALLEL = 1;
const ES_BATCH_SIZE = 1000;

const EXIT_ERROR_IF_FOUND = !!ARGS.looper;

const DOWNLOADED_KEY: FileDownloadedKeys = `${DOWNLOAD_KIND}_downloaded` as FileDownloadedKeys;
const DELETED_KEY: FileDeletedKeys = `${DOWNLOAD_KIND}_deleted` as FileDeletedKeys;
const URL_KEY: FileURLKeys = `${DOWNLOAD_KIND}_url` as FileURLKeys;
const SIZE_KEY: FileSizeKeys = `${DOWNLOAD_KIND}_size` as FileSizeKeys;

let inProgress = 0;
let esDone = false;

const client = new Client(config.elasticsearch);

const mustNot = [{ term: { [DELETED_KEY]: true } }, { term: { [DOWNLOADED_KEY]: true } }];

const RES_SKIP = 'skipped';

const gotFiles = new Set<string>();
const listedFiles = new Map<string, Set<string>>();

function setHadErrors() {
    process.exitCode = 1;
}

function printStats() {
    console.log(
        'Total:',
        totalCount,
        'Queue:',
        queue.length,
        'Done:',
        doneCount,
        'Success:',
        successCount,
        'Failed:',
        errorCount,
        'Skipped:',
        skippedCount,
        'DirList:',
        listCount,
        'Percent:',
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
        console.log('Processed', todo.length / 2, 'batched updates');
    } catch (error) {
        console.error(error);
        setHadErrors();
    }
}

let batcherInterval: NodeJS.Timeout | undefined = setInterval(async () => esRunBatchUpdate(ES_BATCH_SIZE_2), 1000);

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

async function addURL(item: ESItem) {
    const url = item._source[URL_KEY];

    const file: QueueEntry = {
        url,
        size: item._source[SIZE_KEY] || 0,
        id: item._id,
        downloaded: item._source[DOWNLOADED_KEY],
        deleted: item._source[DELETED_KEY],
        dest: url ? DEST_FOLDER + pathFixer(url.replace(/^https?:\/\//, '')) : '',
    };

    if (!file.dest || gotFiles.has(file.dest)) {
        inProgress++;
        await downloadDone(file, RES_SKIP);
        return;
    }
    gotFiles.add(file.dest);

    const dir = mkdirpFor(file.dest);

    let fileSet = listedFiles.get(dir);
    if (!fileSet) {
        fileSet = new Set<string>();
        for (const file of await readdir(dir)) {
            fileSet.add(file);
        }
        listCount++;
        listedFiles.set(dir, fileSet);
    }

    if (fileSet.has(basename(file.dest))) {
        try {
            const stat_res = await stat(file.dest);
            if (stat_res && (stat_res.size === file.size || file.size <= 0)) {
                inProgress++;
                await downloadDone(file, RES_SKIP);
                return;
            }
        } catch (error) {
            if ((error as any).code !== 'ENOENT') {
                console.error(error);
                return;
            }
        }
    }

    queue.push(file);
    setImmediate(downloadNext);
}

async function downloadDone(file: QueueEntry, success: boolean | 'skipped', fileDeleted = false) {
    if (success === RES_SKIP) {
        skippedCount++;
    } else if (success) {
        successCount++;
    } else {
        errorCount++;
    }
    doneCount++;
    inProgress--;

    setImmediate(downloadNext);

    const docBody: Partial<ESPost> = {};
    if (success) {
        if (file.downloaded) {
            return;
        }
        docBody[DOWNLOADED_KEY] = true;
    } else if (fileDeleted) {
        if (file.deleted) {
            return;
        }
        docBody[DELETED_KEY] = true;
    } else {
        return;
    }

    esQueue.push(
        {
            update: {
                _index: 'e621posts',
                _id: file.id,
            },
        },
        {
            doc: docBody,
        },
    );

    await checkEnd();
}

async function requestPromise(url: string): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
        request(url, { agent }, resolve).on('error', reject).end();
    });
}

async function waitOnEvent(obj: EventEmitter, event: string): Promise<void> {
    return new Promise((resolve) => {
        obj.once(event, resolve);
    });
}

async function downloadNext() {
    if (inProgress >= MAX_PARALLEL) {
        return;
    }

    const file = queue.pop();
    if (!file) {
        return;
    }
    inProgress++;

    const out = createWriteStream(file.dest);

    try {
        const res = await requestPromise(file.url!);

        if (res.statusCode === 404) {
            await downloadDone(file, false, true);
            return;
        }

        if (res.statusCode !== 200) {
            console.error('Bad status code', res.statusCode, 'on', file.url);
            setHadErrors();
            await downloadDone(file, false);
            return;
        }

        res.pipe(out);

        await waitOnEvent(out, 'finish');

        if (file.size <= 0) {
            await downloadDone(file, true);
            return;
        }

        let success = false;
        try {
            const stat_res = await stat(file.dest);
            success = stat_res && stat_res.size === file.size;
        } catch {
            success = false;
        }
        if (!success) {
            setHadErrors();
        }
        await downloadDone(file, success);
    } catch (error) {
        console.error('Error', error, 'on', file.url);
        setHadErrors();
        await downloadDone(file, false);
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
        promises.push(addURL(hit as ESItem));
    }
    await Promise.all(promises);

    if (totalCount === foundCount) {
        console.log('ES all added', foundCount);
        esDone = true;
        await checkEnd();
        return false;
    }

    return true;
}

async function main() {
    let response = await client.search({
        index: 'e621posts',
        scroll: '60s',
        body: {
            size: ES_BATCH_SIZE,
            query: {
                bool: {
                    must_not: mustNot,
                    must: { exists: { field: URL_KEY } },
                },
            },
        },
    });

    while (await getMoreUntilDone(response)) {
        response = await client.scroll({
            scroll_id: response._scroll_id,
            scroll: '60s',
        });
    }
}

main()
    .catch((error) => {
        console.error('ES scan error, setting early exit', error.stack || error);
        esDone = true;
        setHadErrors();
    })
    .then(checkEnd);
function configureDotenv() {
    throw new Error('Function not implemented.');
}
