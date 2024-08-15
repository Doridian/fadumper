/* eslint-disable unicorn/numeric-separators-style */
/* eslint-disable no-console */
import { configDotenv } from 'dotenv';
import { Client } from './fa/Client';
import { DownloadableFile } from './fa/Downloadable';
import { RawAPI } from './fa/RawAPI';

configDotenv();

async function main(): Promise<void> {
    if (process.env.FA_COOKIE_A && process.env.FA_COOKIE_B) {
        console.log('Logging in with cookies');
    } else {
        console.log('Anonymous login');
    }

    const rawAPI = new RawAPI(process.env.FA_COOKIE_A, process.env.FA_COOKIE_B);
    const faClient = new Client(rawAPI);
    const sub = await faClient.getSubmission(56865266);
    console.log(sub);
    const downloadClient = new DownloadableFile(rawAPI, sub.image, process.env.FA_DOWNLOAD_PATH);
    await downloadClient.download();

    console.log('Latest submission is', await faClient.getMaxSubmissionID());
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch(console.error);
