export interface IUserTextContent {
    text: string;
    refersToUsers: Set<string>;
    refersToSubmissions: Set<number>;
    refersToJournals: Set<number>;
}

export interface IUserPreview {
    id: string;
    name: string;
}

export interface IUser extends IUserPreview {
    avatar?: URL;
    description: IUserTextContent;
    raw: string;
    type: string;
    createdAt: Date;
}

export interface ISubmissionPreview {
    id: number;
    thumbnail?: URL;
    title: string;
    createdBy: IUserPreview;
}

export interface ISubmission extends ISubmissionPreview {
    description: IUserTextContent;
    raw: string;
    category: string;
    type: string;
    species: string;
    gender: string;
    file: URL;
    createdAt: Date;
    tags: Set<string>;
}

export interface IPaginatedResponse<Entry> {
    nextPage?: number;
    prevPage?: number;
    data: Entry;
}

export interface IJournal {
    id: number;
    title: string;
    description: IUserTextContent;
    raw: string;
    createdBy: IUserPreview;
    createdAt: Date;
}
