export interface IUserTextContent {
    text: string;
    refersToUsers: Set<string>;
    refersToSubmissions: Set<string>;
    refersToJournals: Set<string>;
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
    id: string;
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
}

export interface IPaginatedResponse<Entry> {
    nextPage?: number;
    prevPage?: number;
    data: Entry;
}

export interface IJournal {
    id: string;
    author: IUserPreview;
    title: string;
    content: IUserTextContent;
    createdAt: Date;
}
