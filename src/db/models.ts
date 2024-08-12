/* eslint-disable import/no-unused-modules */
import { IJournal, ISubmission, IUser } from '../fa/models';

export interface IDBDownloadable {
    downloaded: boolean;
    deleted: boolean;
}

export interface IDBUser extends IUser, IDBDownloadable {}

export interface IDBSubmission extends ISubmission, IDBDownloadable {}

export type IDBJournal = IJournal;

export interface ESItem<T> {
    _id: string;
    _source: T;
}
