import test from "node:test";
import assert from "node:assert/strict";
import {
  identifyBookByCoverImage,
  extractIsbnFromText,
} from "../visualBookIdentifier.service.js";

test("Visual Book Identifier Engine", async (t) => {
  await t.test("extracts clean ISBNs from raw OCR text blocks", () => {
    assert.equal(
      extractIsbnFromText("Penguin Classics\nISBN 978-0-14-143951-8\nPrinted in the UK"),
      "9780141439518"
    );

    assert.equal(
      extractIsbnFromText("Vintage Books - ISBN: 0-679-72276-9 - 1989"),
      "0679722769"
    );

    assert.equal(
      extractIsbnFromText("9781501142970 Hardcover Edition"),
      "9781501142970"
    );

    assert.equal(extractIsbnFromText("Random text without numbers"), null);
  });

  await t.test("reconciles book title and author queries via cross-catalog search", async () => {
    const result = await identifyBookByCoverImage({
      textHint: "The Great Gatsby\nF. Scott Fitzgerald",
    });

    assert.equal(result.success, true);
    assert.ok(result.topMatch !== null);
    assert.match(result.topMatch!.title, /Great Gatsby/i);
    assert.match(result.topMatch!.author || "", /Fitzgerald/i);
    assert.ok(result.candidates.length > 0);
  });

  await t.test("handles unidentifiable image text gracefully without throwing", async () => {
    const result = await identifyBookByCoverImage({
      textHint: "",
    });

    assert.equal(result.success, false);
    assert.equal(result.topMatch, null);
    assert.ok(result.error);
  });
});
