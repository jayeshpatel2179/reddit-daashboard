import { XMLParser } from "fast-xml-parser";
import { convert } from "html-to-text";

export type RawEntry = {
  id: string; // "t3_xxx" for posts, "t1_xxx" for comments
  title: string;
  author: string;
  link: string;
  published: string;
  html: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  htmlEntities: true,
  isArray: (name) => name === "entry" || name === "link",
});

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return String((v as Record<string, unknown>)["#text"] ?? "");
  return String(v);
}

export function parseFeed(xml: string): RawEntry[] {
  const doc = parser.parse(xml);
  const entries: Record<string, unknown>[] = doc?.feed?.entry ?? [];
  return entries.map((e) => {
    const links = (e.link as Record<string, string>[] | undefined) ?? [];
    return {
      id: text(e.id),
      title: text(e.title),
      author: text((e.author as Record<string, unknown> | undefined)?.name).replace(/^\/u\//, ""),
      link: links[0]?.["@_href"] ?? "",
      published: text(e.published) || text(e.updated),
      html: text(e.content),
    };
  });
}

/** Reddit wraps self-text in <div class="md">; link posts only have the "submitted by" table. */
export function extractSelfText(html: string): string {
  const md = html.match(/<div class="md">([\s\S]*?)<\/div>\s*<!-- SC_ON -->/);
  return md ? htmlToPlain(md[1]) : "";
}

/** For link/image posts, the "[link]" anchor points at the external URL. */
export function extractPostLink(html: string): string | undefined {
  const m = html.match(/<a href="([^"]+)">\[link\]<\/a>/);
  if (!m) return undefined;
  const url = m[1];
  return /reddit\.com\/r\/[^/]+\/comments\//.test(url) ? undefined : url;
}

export function htmlToPlain(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SKIP_LINK = /(reddit\.com\/(user|u|message|r\/[^/]+\/wiki)|redd\.it\/?$|^\/u\/|^\/r\/)/i;

/** Useful external links posted inside a comment or post body. */
export function extractLinks(html: string): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const m of html.matchAll(/<a href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (SKIP_LINK.test(url)) continue;
    const label = htmlToPlain(m[2]).trim();
    if (label === "[link]" || label === "[comments]") continue;
    out.push({ url, label: label && label !== url ? label : "" });
  }
  return out;
}
