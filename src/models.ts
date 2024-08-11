export interface IUserPreview {
    id: string;
    name: string;
}

export interface IUser extends IUserPreview {
    avatar?: URL;
    profile: string;
    userType: string;
    registered: Date;
}

export interface ISubmissionPreview {
    id: string;
    thumbnail: URL;
    title: string;
    uploader?: IUserPreview;
}

export interface ISubmission extends ISubmissionPreview {
    file: URL;
    description: string;
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

export interface IJournal {
    id: string;
    author?: IUserPreview;
    title: string;
    content: string;
    uploaded: Date;
}
