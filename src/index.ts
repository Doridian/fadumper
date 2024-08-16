/* eslint-disable unicorn/numeric-separators-style */
/* eslint-disable no-console */
import { configDotenv } from 'dotenv';
import { Client } from './fa/Client.js';
import { DownloadableFile } from './fa/Downloadable.js';
import { RawAPI } from './fa/RawAPI.js';

configDotenv();

async function main(): Promise<void> {
    if (process.env.FA_COOKIE_A && process.env.FA_COOKIE_B) {
        console.log('Logging in with cookies');
    } else {
        console.log('Anonymous login');
    }

    const rawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);
    const faClient = new Client(rawAPI);
    const sub = await faClient.getSubmission(30414);
    console.log(sub);

    const dl = new DownloadableFile(rawAPI, sub.thumbnail);
    await dl.download();

    console.log('Latest submission is', await faClient.getMaxSubmissionID());
}

await main();
