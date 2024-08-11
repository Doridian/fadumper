export interface IUserPreview {
    id: string;
    name: string;
}

export interface IUser extends IUserPreview {
    avatar?: URL;
    profileText: string;
    type: string;
    createdAt: Date;
}

export interface ISubmissionPreview {
    id: string;
    thumbnail: URL;
    title: string;
    uploader?: IUserPreview;
}

export interface ISubmission extends ISubmissionPreview {
    description: string;
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
    author?: IUserPreview;
    title: string;
    content: string;
    createdAt: Date;
}
