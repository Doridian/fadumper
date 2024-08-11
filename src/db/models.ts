/* eslint-disable import/no-unused-modules */
import { IJournal, ISubmission, IUser } from '../fa/models';

export interface IDBUser extends IUser {
    avatarDownloaded: boolean;
}

export interface IDBSubmission extends ISubmission {
    thumbnailDownloaded: boolean;
    imageDownloaded: boolean;
}

export type IDBJournal = IJournal;

export interface ESItem<T> {
    _id: string;
    _source: T;
}
