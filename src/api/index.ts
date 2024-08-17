/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { URL } from 'node:url';
import { Client as ESClient } from '@elastic/elasticsearch';
import { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import express from 'express';
import { logger } from '../lib/log.js';

const app = express();
const client = new ESClient({
    node: process.env.ES_URL,
});

type ESRecordType = Record<string, string>;

function filterURL(container: ESRecordType, field: string, req: express.Request) {
    if (container[field]) {
        const url = new URL(container[field]);
        url.pathname = `/files/${url.host}${url.pathname}`;
        url.host = req.hostname;
        url.protocol = req.protocmore
function filterESHit(hit: SearchHit<ESRecordType>, req: express.Request): ESRecordType {
    const source = hit._source;
    if (!source) {
        throw new Error('No source');
    }
    filterURL(source, 'file_url', req);
    filterURL(source, 'sample_url', req);
    filterURL(source, 'preview_url', req);
    return source;
}

async function processSearch(
    query: Record<string, unknown>,
    req: express.Request,
    faType: 'journal' | 'submission' | 'user',
) {
    const size = req.query.limit ? Number.parseInt(req.query.limit.toString(), 10) : 100;

    if (Object.keys(query).length < 1) {
        query.match_all = {};
    }

    const res = await client.search({
        index: `fa_${faType}s`,
        body: {
            size,
            query,
        },
    });

    return (res.hits.hits as SearchHit<ESRecordType>[]).map((hit: SearchHit<ESRecordType>) => filterESHit(hit, req));
}

function addTerms(query: Record<string, unknown>, field: string, terms: string[], typ = 'must') {
    if (terms.length < 1) {
        return;
    }

    if (!query.bool) {
        query.bool = {};
    }

    const qBool = query.bool as Record<string, unknown[] | undefined>;

    if (!qBool[typ]) {
        qBool[typ] = [];
    }

    const qtyp = qBool[typ];
    for (const term of terms) {
        qtyp.push({ term: { [field]: term } });
    }
}

function addNegatableTerms(query: Record<string, unknown>, field: string, terms: string[]) {
    const posTerms: string[] = [];
    const negTerms: string[] = [];

    for (const term of terms) {
        if (term.startsWith('-')) {
            negTerms.push(term.slice(1));
        } else {
            posTerms.push(term);
        }
    }

    addTerms(query, field, posTerms, 'must');
    addTerms(query, field, negTerms, 'must_not');
}

app.get('/api/v1/submissions', async (req: express.Request, res: express.Response) => {
    const query = {};
    if (req.query.tags) {
        addNegatableTerms(query, 'tags', req.query.tags.toString().split(' '));
    }
    res.send(await processSearch(query, req, 'submission'));
});

app.post('/api/v1/submissions', async (req: express.Request, res: express.Response) => {
    const query = JSON.parse(req.body as string) as Record<string, unknown>;
    res.send(await processSearch(query, req, 'submission'));
});

app.get('/api/v1/healthcheck', (_: express.Request, res: express.Response) => {
    res.send({ ok: true });
});

app.listen(8001, () => {
    logger.info('fadumper API online');
});

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});
