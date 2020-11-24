import { ParsedUrlQueryInput } from 'querystring';
import { addQueryToUrl, appendPathnameToUrl } from 'url-transformers';
import { compactDefined, flow } from './fp';
import { ApiResponse, handleFetchResponse, HandleResponse } from './response';
import { isDefined, OmitStrict } from './typescript';

type BuildUrlParams = {
  pathname: string;
  query: ParsedUrlQueryInput;
};

export const buildUrl = ({ pathname, query }: BuildUrlParams) =>
  flow(appendPathnameToUrl(pathname), addQueryToUrl(compactDefined(query)));

type FetchParams = Pick<RequestInit, 'method'>;
/**
 * The params generated by the library
 */
type BaseRequestParams = BuildUrlParams &
  FetchParams &
  // `headers` is not part of FetchParams because we want to allow headers in the additional params as well
  Pick<RequestInit, 'headers'>;

/**
 * Additional fetch options provided by the user on a per-call basis
 */
type AdditionalPerFetchParams = Omit<RequestInit, keyof FetchParams>;
export type CompleteRequestParams = BaseRequestParams & AdditionalPerFetchParams;
type HandleRequest<Args> = (
  a: Args,
  additionalFetchOptions?: AdditionalPerFetchParams,
) => CompleteRequestParams;

/**
 * helper used to type-check the arguments, and add default params for all requests
 */
export const createRequestHandler = <Args>(
  fn: (a: Args) => BaseRequestParams,
): HandleRequest<Args> => (a, additionalFetchOptions = {}) => {
  const { headers, query, ...baseReqParams } = fn(a);
  const queryToUse = compactDefined(query);

  return {
    ...baseReqParams,
    ...additionalFetchOptions,
    query: queryToUse,
    headers: {
      ...headers,
      ...additionalFetchOptions.headers,
    },
  };
};

/**
 * Initial parameters that apply to all calls
 */
type InitParams = {
  apiVersion?: string;
} & OmitStrict<RequestInit, 'method' | 'body'> &
  ({ accessKey: string; apiUrl?: never } | { apiUrl: string; accessKey?: never });

type RequestGenerator<Args, ResponseType> = {
  handleRequest: HandleRequest<Args>;
  handleResponse: HandleResponse<ResponseType>;
};

type InitMakeRequest = (
  args: InitParams,
) => <Args, ResponseType>(
  handlers: RequestGenerator<Args, ResponseType>,
) => (...a: Parameters<typeof handlers['handleRequest']>) => Promise<ApiResponse<ResponseType>>;

export const initMakeRequest: InitMakeRequest = ({
  accessKey,
  apiVersion = 'v1',
  apiUrl = 'https://api.unsplash.com',
  headers: generalHeaders,
  ...generalFetchOptions
}) => ({ handleResponse, handleRequest }) =>
  flow(
    handleRequest,
    ({ pathname, query, method = 'GET', headers: endpointHeaders, body, signal }) => {
      const url = buildUrl({ pathname, query })(apiUrl);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          ...generalHeaders,
          ...endpointHeaders,
          'Accept-Version': apiVersion,
          ...(isDefined(accessKey) ? { Authorization: `Client-ID ${accessKey}` } : {}),
        },
        body,
        signal,
        ...generalFetchOptions,
      };

      return fetch(url, fetchOptions).then(handleFetchResponse(handleResponse));
    },
  );
