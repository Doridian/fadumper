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
    type: string;
    createdAt: Date;
}

export interface ISubmissionPreview {
    id: number;
    thumbnail: URL;
    title: string;
    uploader: IUserPreview;
}

export interface ISubmission extends ISubmissionPreview {
    description: IUserTextContent;
    category: string;
    type: string;
    species: string;
    gender: string;
    imageURL: URL;
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
    author: IUserPreview;
    title: string;
    content: IUserTextContent;
    createdAt: Date;
}
