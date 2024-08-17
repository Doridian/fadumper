import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types';
import { DownloadableFile } from '../fa/Downloadable.js';
import { HttpError } from '../fa/RawAPI.js';

const madeDirs = new Set<string>();

export async function mkdirpFor(file: string): Promise<string> {
    const dir = path.dirname(file);
    await mkdirp(dir);
    return dir;
}

export async function mkdirp(raw_dir: string): Promise<void> {
    if (madeDirs.has(raw_dir)) {
        return;
    }
    const dir = path.normalize(raw_dir);
    if (madeDirs.has(dir)) {
        return;
    }

    try {
        await mkdir(dir);
    } catch (error) {
        switch ((error as { code: string }).code) {
            case 'ENOENT':
                await mkdirp(path.dirname(dir));
                await mkdir(dir);
                break;
            case 'EEXIST':
                break;
            default:
                throw error;
        }
    }

    madeDirs.add(raw_dir);
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

export const FileDeleted = Symbol('FileDeleted');

export async function downloadOne(dl: DownloadableFile): Promise<string | typeof FileDeleted | undefined> {
    try {
        return await dl.download();
    } catch (error) {
        if (error instanceof HttpError && (error.status === 404 || error.status === 403)) {
            return FileDeleted;
        }
        throw error;
    }
}
