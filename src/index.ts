/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
import { configDotenv } from 'dotenv';
import { Client } from './Client';
import { RawAPI } from './RawAPI';
import { IUserPreview } from './models';

configDotenv();

async function main(): Promise<void> {
    if (process.env.FA_COOKIE_A && process.env.FA_COOKIE_B) {
        console.log('Logging in with cookies');
    } else {
        console.log('Anonymous login');
    }

    const startUser = process.env.FA_GRAPH_START ?? 'doridian';

    const fa = new Client(new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B));
    const img = await fa.getSubmission('9380872');
    console.log(img);

    throw new Error('no');
    const graph = await buildUserGraph(fa, startUser, 2);
    console.log(graph);
    console.log(graph.size);
}

interface IUserGraphQueueEntry {
    id: string;
    raw: IUserPreview;
    depth: number;
}

async function buildUserGraph(FA: Client, startUser: string, maxDepth: number): Promise<Set<string>> {
    const queue: IUserGraphQueueEntry[] = [];
    const visited = new Set<string>();

    console.log(`Start user ${startUser} is watching users`);
    for await (const user of FA.getWatching(startUser)) {
        queue.push({ id: user.id, depth: 1, raw: user });
    }

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
        console.log(`User ${entry.id} is watching users`);
        for await (const user of FA.getWatching(entry.id)) {
            queue.push({ id: user.id, raw: user, depth: entry.depth + 1 });
        }
    }

    return visited;
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch(console.error);
