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

    const sub = await faClient.getSubmission(35_247_202);
    logger.info('Sub %s', JSON.stringify(sub));
}

await main();
