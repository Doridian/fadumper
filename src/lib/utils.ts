import { mkdirSync } from 'node:fs';
import path from 'node:path';

const madeDirs = new Set();

export function mkdirpFor(file: string) {
    const dir = dirname(file);
    mkdirp(dir);
    return dir;
}

export function mkdirp(raw_dir: string) {
    if (madeDirs.has(raw_dir)) {
        return;
    }
    const dir = normalize(raw_dir);
    if (madeDirs.has(dir)) {
        return;
    }

    try {
        mkdirSync(dir);
    } catch (error) {
        switch ((error as any).code) {
            case 'ENOENT':
                mkdirp(dirname(dir));
                mkdirSync(dir);
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

export function getNumericValue(val: any): number {
    if (val.value !== undefined) {
        return val.value as number;
    }
    return val as number;
}

export function pathFixer(path: string) {
    path = normalize(path);
    if (path.startsWith('.') || path.startsWith('/')) {
        path = `_${path}`;
    }
    return path;
}
