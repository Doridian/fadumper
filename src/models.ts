export interface IUserPreview {
    id: string;
    name: string;
}

export interface ISubmissionPreview {
    id: string;
    thumbnail: URL;
    title: string;
    uploader: IUserPreview;
}

export interface ISubmission extends ISubmissionPreview {
    file: URL;
    description: string;
    category: string;
    type: string;
    species: string;
    gender: string;
}

export interface IPaginatedResponse<Entry> {
    nextPage: number | undefined;
    prevPage: number | undefined;
    data: Entry;
}
