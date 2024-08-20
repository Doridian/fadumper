/* eslint-disable unicorn/numeric-separators-style */
import { configDotenv } from 'dotenv';
import { Client } from './fa/Client.js';
import { DownloadableFile } from './fa/Downloadable.js';
import { RawAPI } from './fa/RawAPI.js';
import { logger } from './lib/log.js';

configDotenv();

async function main(): Promise<void> {
    if (process.env.FA_COOKIE_A && process.env.FA_COOKIE_B) {
        logger.info('Logging in with cookies');
    } else {
        logger.info('Anonymous login');
    }

    const rawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);
    const faClient = new Client(rawAPI);
    const sub = await faClient.getSubmission(438208);
    logger.info('Got sub %s', sub);
    const sub2 = await faClient.getSubmission(3);
    logger.info('Got sub2 %s', sub2);

    if (!sub.thumbnail) {
        logger.error('No thumbnail found');
        return;
    }

    const dl = new DownloadableFile(rawAPI, sub.thumbnail);
    await dl.download();

    logger.info('Latest submission is %i', await faClient.getMaxSubmissionID());
}

await main();
