declare module "@11ty/eleventy-fetch" {
  interface EleventyFetchOptions {
    /** How long a response is reused before it is refetched, e.g. "1h" or "1d". */
    duration?: string;
    /** Shape of the resolved value. Defaults to "buffer". */
    type?: "buffer" | "text" | "json" | "parsed-xml";
    directory?: string;
    /** Serve a stale cached copy instead of throwing when the fetch fails. */
    dryRun?: boolean;
    verbose?: boolean;
    /** Passed straight through to the underlying fetch call. */
    fetchOptions?: RequestInit;
  }

  /** Fetches a remote resource, caching it on disk between builds. */
  export default function EleventyFetch(
    source: string,
    options?: EleventyFetchOptions,
  ): Promise<unknown>;
}
