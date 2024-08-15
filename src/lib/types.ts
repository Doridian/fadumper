export interface APIFileInfo {
    size: number;
    url: string;
    height: number;
    width: number;
}

export interface BasePost {
    id: number;
    sources?: string[];
    source?: string;
    children?: string[] | string;
}
