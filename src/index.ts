import { configDotenv } from 'dotenv';
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

    const dl = new DownloadableFile(
        rawAPI,
        'https://t.furaffinity.net/9380872@600-1354491506.jpg',
        '90989aeef4cec5ecea69cda1d8e2f1560e4cf3c34825ca1656d3ba22820bef33',
    );

    logger.info('DL1 %s', await dl.isDownloaded());

    const dl2 = new DownloadableFile(
        rawAPI,
        'https://t.furaffinity.net/9380872@600-1354491506.jpg',
        '90989aeef4cec5ecea69cda1d8e2f1560e4cf3c34825ca1656d3ba22820bef44',
    );

    logger.info('DL2 %s', await dl2.isDownloaded());
}

await main();
