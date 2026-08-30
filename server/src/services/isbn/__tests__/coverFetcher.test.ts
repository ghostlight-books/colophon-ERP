import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateCoverCandidatesList,
  upgradeGoogleBooksCoverUrl,
  verifyCoverImageUrl,
} from "../coverFetcher.service.js";

describe("Multi-Source Book Cover Resolution Engine", () => {
  it("generates structured candidates from multiple sources", () => {
    const candidates = generateCoverCandidatesList({
      isbn: "9780141439518",
      openLibCoverId: 8231856,
      oclc: "12345678",
      lccn: "2003055555",
      isbndbCover: "https://images.isbndb.com/covers/95/18/9780141439518.jpg",
      googleCover: "http://books.google.com/books/content?id=xyz&printsec=frontcover&img=1&zoom=1&edge=curl",
      thriftbooksCover: "https://images.thriftbooks.com/item/m/9780141439518.jpg",
    });

    assert.ok(candidates.length >= 6);

    const sources = candidates.map((c) => c.source);
    assert.ok(sources.includes("Google Books"));
    assert.ok(sources.includes("Open Library"));
    assert.ok(sources.includes("ThriftBooks"));
    assert.ok(sources.includes("AbeBooks"));
    assert.ok(sources.includes("ISBNdb"));
  });

  it("upgrades Google Books cover URLs to high resolution", () => {
    const raw = "http://books.google.com/books/content?id=xyz&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api";
    const upgraded = upgradeGoogleBooksCoverUrl(raw);
    assert.ok(upgraded?.startsWith("https://"));
    assert.ok(upgraded?.includes("zoom=2"));
    assert.ok(!upgraded?.includes("&edge=curl"));
  });

  it("handles null and empty URL probes gracefully", async () => {
    const res = await verifyCoverImageUrl(null);
    assert.strictEqual(res, false);

    const emptyRes = await verifyCoverImageUrl("");
    assert.strictEqual(emptyRes, false);
  });
});

