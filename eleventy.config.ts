import { DateTime } from "luxon";
import { pathToFileURL } from "node:url";
import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import { HtmlBasePlugin } from "@11ty/eleventy";

import site from "./src/_data/site.json" with { type: "json" };
import navigation from "./src/_data/navigation.json" with { type: "json" };

/**
 * The site normally lives at the root of its own domain, but a GitHub Pages
 * project site is served from /<repo>/. PATH_PREFIX lets that deploy rewrite
 * every root-relative URL without any change to the templates.
 */
const PATH_PREFIX = process.env.PATH_PREFIX ?? "/";

interface NavigationItem {
  title: string;
  url: string;
  children?: Array<{ title: string; url: string }>;
  highlight?: boolean;
}

interface EleventyConfig {
  addPassthroughCopy: (path: string | Record<string, string>) => void;
  addWatchTarget: (path: string) => void;
  addPlugin: (plugin: unknown, options?: unknown) => void;
  addFilter: (name: string, fn: (...args: never[]) => unknown) => void;
  addCollection: (name: string, fn: (api: CollectionApi) => unknown) => void;
  addGlobalData: (name: string, value: unknown) => void;
  addDataExtension: (
    extensions: string,
    options: { parser: (contents: string, filePath: string) => unknown; read?: boolean },
  ) => void;
  setLibrary: (name: string, library: unknown) => void;
  addShortcode: (name: string, fn: (...args: never[]) => string) => void;
}

interface CollectionItem {
  date: Date;
  data: Record<string, unknown>;
  url?: string;
}

interface CollectionApi {
  getFilteredByGlob: (glob: string) => CollectionItem[];
}

const NEWS_GLOB = "src/news/**/*.md";

export default function configure(eleventyConfig: EleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static": "." });
  eleventyConfig.addWatchTarget("src/assets/css/");

  // Eleventy only discovers .js/.cjs/.mjs/.json data files out of the box, so
  // register .ts as well. Node strips the types on import.
  eleventyConfig.addDataExtension("ts", {
    read: false,
    parser: async (_contents: string, filePath: string) => {
      const module = await import(pathToFileURL(filePath).href);
      const value = module.default ?? module;
      return typeof value === "function" ? await value() : value;
    },
  });

  eleventyConfig.setLibrary(
    "md",
    markdownIt({ html: true, linkify: true, typographer: true }).use(markdownItAnchor),
  );

  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/news/feed.xml",
    collection: { name: "news", limit: 25 },
    metadata: {
      language: "en",
      title: site.title,
      subtitle: site.description,
      base: site.url,
      author: { name: site.title, email: site.email },
    },
  });

  eleventyConfig.addFilter("readableDate", (value: Date, format?: string) =>
    DateTime.fromJSDate(value, { zone: site.timezone }).toFormat(format ?? "LLLL d, yyyy"),
  );

  eleventyConfig.addFilter("isoDate", (value: Date) =>
    DateTime.fromJSDate(value, { zone: site.timezone }).toISODate(),
  );

  eleventyConfig.addFilter("year", (value: Date) => String(value.getFullYear()));

  eleventyConfig.addFilter("feastDate", (value: string) =>
    DateTime.fromISO(value, { zone: site.timezone }).toFormat("LLL d"),
  );

  // Renders a timed calendar event's start as "6:30 PM"; all-day events omit it.
  eleventyConfig.addFilter("eventTime", (value: string) =>
    DateTime.fromISO(value, { zone: site.timezone }).toFormat("h:mm a"),
  );

  eleventyConfig.addFilter("limit", <T>(items: T[], count: number) => items.slice(0, count));

  // Named absUrl rather than absoluteUrl: @11ty/eleventy-plugin-rss registers a
  // Nunjucks filter of that name which takes precedence in .njk templates and
  // silently returns its input when called without a base.
  eleventyConfig.addFilter("absUrl", (path: string) => new URL(path, site.url).toString());

  eleventyConfig.addCollection("news", (collection: CollectionApi) =>
    collection
      .getFilteredByGlob(NEWS_GLOB)
      .filter((item) => item.data.draft !== true)
      .sort((a, b) => b.date.getTime() - a.date.getTime()),
  );

  eleventyConfig.addShortcode("year", () => String(new Date().getFullYear()));

  eleventyConfig.addGlobalData(
    "sections",
    (navigation as NavigationItem[]).filter((item) => Boolean(item.children)),
  );

  // Preview deploys (GitHub Pages) must not be indexed: a public copy of the
  // parish site would compete with the real one in search results.
  eleventyConfig.addGlobalData("isPreview", PATH_PREFIX !== "/");

  return {
    pathPrefix: PATH_PREFIX,
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
}
