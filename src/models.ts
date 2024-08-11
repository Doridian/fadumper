/* eslint-disable import/no-unused-modules */

export interface IUserTextContent {
    text: string;
    refersToUsers: Set<IUserPreview>;
    refersToSubmissions: Set<ISubmissionPreviewMinimal>;
    refersToJournals: Set<IJournalPreview>;
}

export interface IUserPreview {
    id: string;
    name: string;
}

export interface IUser extends IUserPreview {
    avatar?: URL;
    description: IUserTextContent;
    type: string;
    createdAt: Date;
}

export interface ISubmissionPreviewMinimal {
    id: string;
}

export interface ISubmissionPreview extends ISubmissionPreviewMinimal {
    thumbnail: URL;
    title: string;
    uploader?: IUserPreview;
}

export interface ISubmission extends ISubmissionPreview {
    description: IUserTextContent;
    category: string;
    type: string;
    species: string;
    gender: string;
    imageURL: URL;
    createdAt: Date;
}

export interface IPaginatedResponse<Entry> {
    nextPage?: number;
    prevPage?: number;
    data: Entry;
}

export interface IJournalPreview {
    id: string;
}

export interface IJournal extends IJournalPreview {
    author?: IUserPreview;
    title: string;
    content: IUserTextContent;
    createdAt: Date;
}
