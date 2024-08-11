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
    profile: IUserTextContent;
    userType: string;
    registered: Date;
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
    file: URL;
    description: IUserTextContent;
    category: string;
    type: string;
    species: string;
    gender: string;
    uploaded: Date;
}

export interface IPaginatedResponse<Entry> {
    nextPage: number | undefined;
    prevPage: number | undefined;
    data: Entry;
}

export interface IJournalPreview {
    id: string;
}

export interface IJournal extends IJournalPreview {
    author?: IUserPreview;
    title: string;
    content: IUserTextContent;
    uploaded: Date;
}
