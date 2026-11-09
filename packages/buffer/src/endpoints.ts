// Where Buffer's OAuth server and GraphQL API live. Tests and local development can point
// these at a mock server; production always uses the defaults.

export interface BufferEndpoints {
  /** Base URL of the OAuth server. It is also the issuer that Buffer reports. */
  authUrl: string;
  /** The GraphQL endpoint. */
  apiUrl: string;
}

export const DEFAULT_ENDPOINTS: BufferEndpoints = {
  authUrl: "https://auth.buffer.com",
  apiUrl: "https://api.buffer.com",
};

export function authorizeEndpoint(endpoints: BufferEndpoints): string {
  return `${endpoints.authUrl}/auth`;
}

export function tokenEndpoint(endpoints: BufferEndpoints): string {
  return `${endpoints.authUrl}/token`;
}

export function revocationEndpoint(endpoints: BufferEndpoints): string {
  return `${endpoints.authUrl}/token/revocation`;
}
