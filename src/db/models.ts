import { IJournal, ISubmission, IUser } from '../fa/models.js';

export interface IDBDownloadable {
    downloaded: boolean | undefined;
    deleted: boolean | undefined;
    hash: string | undefined;
}

interface IDBDescribable {
    description: string;
    descriptionRefersToUsers: string[];
    descriptionRefersToSubmissions: number[];
    descriptionRefersToJournals: number[];
}

interface IDBCreatedBy {
    createdBy: string;
    createdByUsername: string;
}

interface IDBBase {
    refreshedAt: Date;
}

export interface IDBUser
    extends Omit<IUser, 'avatar' | 'description'>,
        IDBBase,
        IDBDescribable,
        IDBDownloadable,
        IDBCreatedBy {
    avatar: string;
}

export interface IDBSubmission
    extends Omit<ISubmission, 'createdBy' | 'description' | 'file' | 'tags' | 'thumbnail'>,
        IDBBase,
        IDBDescribable,
        IDBDownloadable,
        IDBCreatedBy {
    tags: string[];
    file: string;
    thumbnail: string;
}

export interface IDBJournal
    extends Omit<IJournal, 'createdBy' | 'description'>,
        IDBBase,
        IDBDescribable,
        IDBDownloadable,
        IDBCreatedBy {}

export interface ESItem<T> {
    _id: string;
    _index: string;
    _source: T;
}
