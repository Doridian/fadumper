/* eslint-disable unicorn/numeric-separators-style */
import { configDotenv } from 'dotenv';
import { Client } from './fa/Client.js';
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
    const sub = await faClient.getSubmission(4536332);
    logger.info('Got sub %s', sub);
    const sub2 = await faClient.getSubmission(9380872);
    logger.info('Got sub2 %s', sub2);

    if (!sub.thumbnail) {
        logger.error('No thumbnail found');
        return;
    }

    logger.info('Latest submission is %i', await faClient.getMaxSubmissionID());
}

await main();
