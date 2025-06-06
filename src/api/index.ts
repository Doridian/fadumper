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

app.use('/ui', express.static(path.join(import.meta.dirname, '..', '..', 'ui')));

app.use(express.text({ type: '*/*' }));

const PORT = Number.parseInt(process.env.PORT ?? '8001', 10);
const HOST = process.env.HOST ?? '127.0.0.1';
const { URL_HOST, URL_PROTOCOL } = process.env;
const URL_FILES_PATH = process.env.URL_FILES_PATH ?? '/files';

type ESRecordType = Record<string, string>;

function filterURL(container: ESRecordType, field: string, hashField: string, outField: string, req: express.Request) {
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
        container[outField] = url.href;
    }
}

function filterESHit(hit: SearchHit<ESRecordType>, req: express.Request) {
    const source = hit._source;
    if (!source) {
        throw new Error('No source');
    }
    filterURL(source, 'file', 'hash', 'fileLocal', req);
}

async function processSearch(
    query: Record<string, unknown>,
    req: express.Request,
    faType: 'journal' | 'submission' | 'user',
) {
    const size = req.query.size ? Number.parseInt(req.query.size.toString(), 10) : 100;
    const from = req.query.from ? Number.parseInt(req.query.from.toString(), 10) : 0;

    if (size < 1 || size > 1000) {
        throw new Error('Invalid size');
    }
    if (from < 0) {
        throw new Error('Invalid from');
    }

    if (Object.keys(query).length < 1) {
        query.match_all = {};
    }

    const res = await client.search({
        index: `fa_${faType}s`,
        size,
        from,
        query,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    for (const hit of res.hits.hits as SearchHit<ESRecordType>[]) {
        filterESHit(hit, req);
    }

    return res.hits;
}

function addTerms(query: Record<string, unknown>, field: string, terms: string[], typ = 'must') {
    if (terms.length < 1) {
        return;
    }

    query.bool ??= {};

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const qBool = query.bool as Record<string, unknown[] | undefined>;

    qBool[typ] ??= [];

    const qtyp = qBool[typ];
    for (const term of terms) {
        qtyp.push({ term: { [field]: term } });
    }
}

function addNegatableTerms(query: Record<string, unknown>, field: string, terms: string[] | string) {
    const posTerms: string[] = [];
    const negTerms: string[] = [];

    if (!Array.isArray(terms)) {
        terms = [terms];
    }

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        addNegatableTerms(query, 'tags', req.query.tags as string[] | string);
    }
    if (req.query.descriptionRefersToUsers) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        addNegatableTerms(query, 'descriptionRefersToUsers', req.query.descriptionRefersToUsers as string[] | string);
    }
    if (req.query.description) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        addNegatableTerms(query, 'description', req.query.description as string[] | string);
    }
    try {
        res.send(await processSearch(query, req, 'submission'));
    } catch (error) {
        res.status(400).send({ error: 'Search error' });
        logger.warn('Search error: %s', error);
    }
});

app.post('/api/v1/submissions', async (req: express.Request, res: express.Response) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const query = JSON.parse(req.body as string) as Record<string, unknown>;
        res.send(await processSearch(query, req, 'submission'));
    } catch (error) {
        res.status(400).send({ error: 'Search error' });
        logger.warn('Search error: %s', error);
    }
});

app.get('/api/v1/healthcheck', (_: express.Request, res: express.Response) => {
    res.send({ ok: true });
});

app.listen(PORT, HOST, () => {
    logger.info('fadumper API online');
});

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});
