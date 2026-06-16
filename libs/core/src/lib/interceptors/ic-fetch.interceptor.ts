import { inject, Injectable } from '@angular/core';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';

import { HTTP_AGENT_OPTIONS_TOKEN } from '../injectors/http-agent';

/**
 * Service for intercepting fetch requests to Internet Computer canisters.
 * Uses @mswjs/interceptors to monkey-patch the global fetch function.
 * This allows intercepting all fetch calls, including those made by @icp-sdk/core.
 */
@Injectable({
  providedIn: 'root',
})
export class IcFetchInterceptorService {
  private callbacks: Array<{
    error?: (error: Error) => void;
    request?: (url: string, init?: RequestInit) => void;
    response?: (response: Response) => void;
  }> = [];
  private httpAgentOptions = inject(HTTP_AGENT_OPTIONS_TOKEN);
  private interceptor?: FetchInterceptor;

  /**
   * Disposes the fetch request interception.
   */
  dispose(): void {
    this.interceptor?.dispose();
  }

  /**
   * Initializes fetch request interception.
   * Must be called in app initializer.
   */
  init(): void {
    this.interceptor = new FetchInterceptor();

    this.interceptor.on('request', ({ request }) => {
      const url = request.url;
      const isIcRequest = this.isIcRequest(url);

      if (isIcRequest) {
        // Call all registered callbacks
        this.callbacks.forEach((callback) => {
          // Convert Headers to plain object
          const headers: Record<string, string> = {};
          request.headers.forEach((value, key) => {
            headers[key] = value;
          });

          callback.request?.(request.url, {
            method: request.method,
            headers,
            body: request.body,
          });
        });
      }
    });

    this.interceptor.on('response', ({ response, request }) => {
      if (!this.isIcRequest(request.url)) return;

      this.callbacks.forEach((callback) => {
        callback.response?.(response);
      });
    });

    this.interceptor.on('unhandledException', ({ error }) => {
      // Check if error is related to IC requests
      this.callbacks.forEach((callback) => {
        // Ensure error is an Error instance
        const errorInstance =
          error instanceof Error ? error : new Error(String(error));
        callback.error?.(errorInstance);
      });
    });

    this.interceptor.apply();
  }

  /**
   * Registers a callback for handling IC requests.
   * @returns Unregister function
   */
  register(callbacks: {
    error?: (error: Error) => void;
    request?: (url: string, init?: RequestInit) => void;
    response?: (response: Response) => void;
  }): () => void {
    this.callbacks.push(callbacks);

    // Return unregister function
    return () => {
      const index = this.callbacks.indexOf(callbacks);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Checks if a URL is an Internet Computer canister request via API.
   * @param url The URL to check
   * @returns true if the URL is an IC API request
   */
  private isIcRequest(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    const host = (
      this.httpAgentOptions.host || 'https://icp-api.io'
    ).toLowerCase();

    // Check that URL starts with the host and contains /api/v{version}/
    return lowerUrl.startsWith(host) && /\/api\/v\d+\//.test(lowerUrl);
  }
}
