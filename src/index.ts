/* eslint-disable unicorn/numeric-separators-style */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
import { configDotenv } from 'dotenv';
import { Client } from './fa/Client';
import { DownloadableFile } from './fa/Downloadable';
import { RawAPI } from './fa/RawAPI';
import { IUserPreview } from './fa/models';

configDotenv();

async function main(): Promise<void> {
    if (process.env.FA_COOKIE_A && process.env.FA_COOKIE_B) {
        console.log('Logging in with cookies');
    } else {
        console.log('Anonymous login');
    }

    const startUser = process.env.FA_START_USER ?? 'doridian';

    const rawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);
    const faClient = new Client(rawAPI);
    const sub = await faClient.getSubmission(56865266);
    console.log(sub);
    const downloadClient = new DownloadableFile(rawAPI, sub.image, process.env.FA_DOWNLOAD_PATH);
    await downloadClient.download();

    console.log('Latest submission is', await faClient.getMaxSubmissionID());

    throw new Error('No');
    const graph = await buildUserGraph(faClient, startUser, 2, {
        scanIncomingWatches: true,
        scanOutgoingWatches: true,
    });
    console.log(graph);
    console.log(graph.size);
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

async function buildUserGraph(
    faClient: Client,
    startUser: string,
    maxDepth: number,
    opt: IGraphOptions,
): Promise<Set<string>> {
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
            for await (const user of faClient.getWatching(entry.id)) {
                queue.push({ id: user.id, raw: user, depth: entry.depth + 1 });
                i++;
            }
            console.log(`User ${entry.id} is watching ${i} users`);
        }
        if (opt.scanIncomingWatches) {
            i = 0;
            for await (const user of faClient.getWatchedBy(entry.id)) {
                queue.push({ id: user.id, raw: user, depth: entry.depth + 1 });
                i++;
            }
            console.log(`User ${entry.id} is watched by ${i} users`);
        }
    }

    return visited;
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch(console.error);
