import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types';
import { DownloadableFile } from '../fa/Downloadable';
import { HttpError } from '../fa/RawAPI';

export function getNumericValue(val: SearchTotalHits | number | undefined): number {
    if (val === undefined) {
        return 0;
    }

    if (typeof val === 'number') {
        return val;
    }

    return val.value;
}

export enum DownloadResult {
    OK,
    DELETED,
}

export async function downloadOne(dl: DownloadableFile): Promise<DownloadResult> {
    try {
        await dl.download();
        return DownloadResult.OK;
    } catch (error) {
        if (error instanceof HttpError && (error.status === 404 || error.status === 403)) {
            return DownloadResult.DELETED;
        }
        throw error;
    }
}
