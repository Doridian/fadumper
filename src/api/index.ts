/* eslint-disable @typescript-eslint/no-base-to-string */
import path from 'node:path';
import { URL } from 'node:url';
import { Client as ESClient } from '@elastic/elasticsearch';
import { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import express from 'express';
import { DOWNLOAD_PATH } from '../fa/Downloadable.js';
import { logger } from '../lib/log.js';
import { makeHashPath } from '../lib/utils.js';

const app = express();
const client = new ESClient({
    node: process.env.ES_URL,
});

app.use('/files', express.static(path.join(DOWNLOAD_PATH, 'hashes')));

app.use(express.text({ type: '*/*' }));

const PORT = Number.parseInt(process.env.PORT ?? '8001', 10);
const { URL_HOST, URL_PROTOCOL } = process.env;
const URL_FILES_PATH = process.env.URL_FILES_PATH ?? '/files';

type ESRecordType = Record<string, string>;

function filterURL(container: ESRecordType, field: string, hashField: string, req: express.Request) {
    if (container[hashField] && container[field]) {
        const url = new URL(container[field]);
        const hashPath = makeHashPath(container[hashField], path.extname(url.pathname));
        url.pathname = `${URL_FILES_PATH}/${hashPath}`;
        if (URL_HOST) {
            url.host = URL_HOST;
        } else {
            url.hostname = req.hostname;
            url.port = `${PORT}`;
        }
        url.protocol = URL_PROTOCOL ?? req.protocol;
        container[field] = url.href;
    }
}

function filterESHit(hit: SearchHit<ESRecordType>, req: express.Request): ESRecordType {
    const source = hit._source;
    if (!source) {
        throw new Error('No source');
    }
    filterURL(source, 'image', 'hash', req);
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
    let query: Record<string, unknown>;
    try {
        query = JSON.parse(req.body as string) as Record<string, unknown>;
    } catch {
        res.status(400).send({ error: 'Invalid JSON' });
        return;
    }
    res.send(await processSearch(query, req, 'submission'));
});

app.get('/api/v1/healthcheck', (_: express.Request, res: express.Response) => {
    res.send({ ok: true });
});

app.listen(PORT, () => {
    logger.info('fadumper API online');
});

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});
