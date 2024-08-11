/* eslint-disable import/no-unused-modules */

export type FileURLKeys = 'file_url' | 'preview_url' | 'sample_url';
export type FileDownloadedKeys = 'file_downloaded' | 'preview_downloaded' | 'sample_downloaded';
export type FileDeletedKeys = 'file_deleted' | 'preview_deleted' | 'sample_deleted';
export type FileSizeKeys = 'file_size' | 'preview_size' | 'sample_size';

export type APINestedTags = {
    [P in TagType]?: string[];
};

export interface APIFileInfo {
    size: number;
    url: string;
    height: number;
    width: number;
}

type APITagsField = APINestedTags | string[] | string;

export interface BasePost {
    id: number;
    sources?: string[];
    source?: string;
    children?: string[] | string;
}

export interface APIPost extends BasePost {
    tags?: APITagsField;
    locked_tags?: APITagsField;

    created_at: string;

    file: APIFileInfo;
    preview: APIFileInfo;
    sample: APIFileInfo;
}