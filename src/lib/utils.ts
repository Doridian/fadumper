import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types';
import pLimit from 'p-limit';
import { DownloadableFile } from '../fa/Downloadable.js';
import { HttpError } from '../fa/RawAPI.js';

const limiter = pLimit(1);

const madeDirs = new Set<string>();

export async function mkdirpFor(file: string): Promise<string> {
    const dir = path.dirname(file);
    await mkdirp(dir);
    return dir;
}

export async function mkdirp(rawDir: string): Promise<void> {
    if (madeDirs.has(rawDir)) {
        return;
    }
    const dir = path.normalize(rawDir);
    if (madeDirs.has(dir)) {
        return;
    }

    const segments = dir.split(path.sep);

    await limiter(async () => {
        let i = segments.length + 1;
        while (--i > 0) {
            const partial = segments.slice(0, i).join(path.sep);
            if (madeDirs.has(partial)) {
                continue;
            }

            try {
                // eslint-disable-next-line no-await-in-loop
                await mkdir(partial);
                i += 2;
            } catch (error) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                switch ((error as { code: string }).code) {
                    case 'ENOENT':
                        continue;
                    case 'EEXIST':
                        madeDirs.add(partial);
                        break;
                    default:
                        throw error;
                }
            }

            if (i > segments.length + 1) {
                break;
            }
            madeDirs.add(partial);
        }
    });

    madeDirs.add(rawDir);
    madeDirs.add(dir);
}

export function getNumericValue(val: SearchTotalHits | number | undefined): number {
    if (val === undefined) {
        return 0;
    }

    if (typeof val === 'number') {
        return val;
    }

    return val.value;
}

export async function downloadOne(dl: DownloadableFile): Promise<boolean> {
    try {
        await dl.download();
        return true;
    } catch (error) {
        if (error instanceof HttpError && (error.status === 404 || error.status === 403)) {
            return false;
        }
        throw error;
    }
}

export async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function makeHashPath(hash: string, ext: string): string {
    return path.join(hash.slice(0, 2), hash.slice(2, 4), `${hash}${ext}`);
}
