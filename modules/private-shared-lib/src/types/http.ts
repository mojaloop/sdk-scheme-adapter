// TODO: Standardize the following
export interface IHttpRequest {
    method: string;
    path: string;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    headers: any;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    body: any;
}
