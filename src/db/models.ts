/* eslint-disable import/no-unused-modules */
import { IJournal, ISubmission, IUser } from '../fa/models';

export interface IDBDownloadable {
    downloaded: boolean;
    deleted: boolean;
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
    _source: T;
}
