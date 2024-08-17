import { IJournal, ISubmission, IUser } from '../fa/models.js';

export interface IDBDownloadable {
    downloaded: boolean;
    deleted: boolean;
    hash: string;
}

export interface IDBDescribable {
    description: string;
    descriptionRefersToUsers: string[];
    descriptionRefersToSubmissions: number[];
    descriptionRefersToJournals: number[];
}

export interface IDBCreatedBy {
    createdBy: string;
    createdByUsername: string;
}

export interface IDBUser extends Omit<IUser, 'avatar' | 'description'>, IDBDescribable, IDBDownloadable, IDBCreatedBy {
    avatar: string;
}

export interface IDBSubmission
    extends Omit<ISubmission, 'createdBy' | 'description' | 'image' | 'tags' | 'thumbnail'>,
        IDBDescribable,
        IDBDownloadable,
        IDBCreatedBy {
    tags: string[];
    image: string;
    thumbnail: string;
}

export interface IDBJournal
    extends Omit<IJournal, 'createdBy' | 'description'>,
        IDBDescribable,
        IDBDownloadable,
        IDBCreatedBy {}

export interface ESItem<T> {
    _id: string;
    _index: string;
    _source: T;
}
