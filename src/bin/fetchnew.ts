import { readFileSync, writeFileSync } from 'node:fs';
import { Client } from '@elastic/elasticsearch';
import { requestPromiseReadBody } from '../lib/http';
import { APINestedTags, APIPost, ESPost, TagClass, TagType, tagTypeMap } from '../lib/types';
import { getNumericValue } from '../lib/utils';
const config = require('../../config.json');
const MAX_ID_PATH = config.maxIdPath;
const client = new Client(config.elasticsearch);

interface PostPage {
    items: ESPost[];
    minId: number;
    maxId: number;
}

interface ESBulkOperation {
    update: {
        _id: string;
        _index: 'e621posts';
        retry_on_conflict: number;
    };
}

interface ESPostDoc {
    doc_as_upsert: true;
    doc: ESPost;
}

type ESQueueEntry = ESBulkOperation | ESPostDoc;

function fixArray(a?: string[] | string, s = ' ') {
    if (a) {
        if (typeof a === 'string') {
            a = a.split(s);
        }
        return Array.from(new Set(a));
    }
    return [];
}

function fixTags(v: APIPost | ESPost, name: TagClass) {
    const a = v[name];
    v[name] = [];
    for (const typ of tagTypeMap) {
        (v as any)[`${name}_${typ}`] = [];
    }
    if (!a) {
        return;
    }

    if ((a as string[] | string).length) {
        v[name] = fixArray(a as string[] | string, ' ');
        return;
    }

    for (const typ of Object.keys(a) as TagType[]) {
        fixTagsSub((a as APINestedTags)[typ], v, `${name}_${typ}`, name);
    }
}

function fixTagsSub(a: string[], v: APIPost | ESPost, name: string, gname: TagClass) {
    a = fixArray(a, ' ');

    const vany = v as any;

    if (!vany[name]) {
        vany[name] = [];
    }

    for (const t of a) {
        (vany[name] as string[]).push(t);
        (v[gname] as string[]).push(t);
    }
}

function fixFile(v: APIPost | ESPost, p: 'file' | 'preview' | 'sample') {
    const va = v as APIPost;
    const ve = v as any;
    ve[`${p}_url`] = va[p].url;
    ve[`${p}_size`] = va[p].size;
    ve[`${p}_height`] = va[p].height;
    ve[`${p}_width`] = va[p].width;
    delete va[p];
}

function normalizer(v: APIPost | ESPost): ESPost {
    // Uniq sources
    const s = v.sources || [];
    if (v.source) {
        s.push(v.source);
    }
    delete v.source;
    const sU = new Set(s);
    v.sources = Array.from(sU);

    fixTags(v, 'tags');
    fixTags(v, 'locked_tags');

    fixFile(v, 'file');
    fixFile(v, 'sample');
    fixFile(v, 'preview');

    const va = v as any;
    va.score = va.score.total;

    // Fix arrays that are just strings...
    v.children = fixArray(v.children, ',');

    // Fix date
    v.created_at = new Date(v.created_at).toISOString();

    return v as ESPost;
}

async function getPage(beforeId?: number): Promise<PostPage> {
    const res = await requestPromiseReadBody(
        `https://e621.net/posts.json?limit=320&typed_tags=1${beforeId ? `&tags=id:<${beforeId}` : ''}`,
        {
            auth: `${config.apiUser}:${config.apiKey}`,
            headers: { 'User-Agent': 'e621updater (Doridian)' },
            timeout: 10_000,
        },
    );
    const body = JSON.parse(res).posts;
    if (body.length < 1) {
        return {
            items: [],
            minId: 0,
            maxId: 0,
        };
    }

    const items = body.map((v: APIPost) => normalizer(v));

    let minId = items[0].id;

    let maxId = items[0].id;
    for (const item of items) {
        const { id } = item;
        if (id < minId) {
            minId = id;
        }
        if (id > maxId) {
            maxId = id;
        }
    }

    return {
        items,
        minId,
        maxId,
    };
}

async function getPageWithRetry(retries: number, beforeId?: number): Promise<PostPage> {
    for (let i = 1; i < retries; i++) {
        try {
            const res = await getPage(beforeId);
            return res;
        } catch (error) {
            console.error(error);
        }
    }
    return getPage(beforeId);
}

async function main() {
    let maxId = -1;
    try {
        maxId = Number.parseInt(readFileSync(MAX_ID_PATH).toString('utf8').trim(), 10);
    } catch (error) {
        console.error('Error loading maxId file:', (error as Error).stack || error);
    }

    if (maxId <= 0) {
        const maxIdRes = await client.search({
            index: 'e621posts',
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
        maxId = getNumericValue(maxIdRes.aggregations!.max_id);
    }

    console.log(`Starting with maxId = ${maxId}`);

    let _maxId = maxId;

    let beforeId;
    while (true) {
        console.log(`Asking with beforeId = ${beforeId}`);
        const data: PostPage = await getPageWithRetry(3, beforeId);
        console.log('Got answer. Inserting into DB...');
        if (data.items.length < 1) {
            console.log('Exhausted pages!');
            break;
        }

        const pageQueue: ESQueueEntry[] = [];

        if (data.maxId > _maxId) {
            _maxId = data.maxId;
        }

        for (const item of data.items) {
            pageQueue.push(
                {
                    update: {
                        _id: item.id.toString(10),
                        _index: 'e621posts',
                        retry_on_conflict: 3,
                    },
                },
                {
                    doc: item,
                    doc_as_upsert: true,
                },
            );
        }

        const result = await client.bulk({
            body: pageQueue,
        });

        if (result.errors) {
            throw new Error(JSON.stringify(result));
        }

        if (data.minId <= maxId) {
            console.log('Done!');
            break;
        }
        beforeId = data.minId;
    }

    writeFileSync(MAX_ID_PATH, _maxId.toString());
}

async function safeMain() {
    try {
        await main();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

safeMain();
