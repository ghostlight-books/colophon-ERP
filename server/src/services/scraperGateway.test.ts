import assert from "node:assert/strict";
import {
  normalizeCondition,
  getRealisticBrowserHeaders,
  buildGatewayUrl,
  extractJsonLdBlocks,
  parseOffersFromJsonLd,
  extractMetaPrice,
} from "./scraperGateway.service.js";
import { extractThriftbooksDetails } from "./thriftbooksScraper.service.js";
import { extractAbeBooksPrice } from "./abebooksScraper.service.js";

console.log("--- Starting Price Scraper & Gateway Tests ---");

// Test 1: Condition Normalization
console.log("Test 1: Condition Normalization...");
assert.equal(normalizeCondition("Brand New"), "New");
assert.equal(normalizeCondition("https://schema.org/NewCondition"), "New");
assert.equal(normalizeCondition("Fine / Like New"), "Like New");
assert.equal(normalizeCondition("Near Fine"), "Like New");
assert.equal(normalizeCondition("Very Good"), "Very Good");
assert.equal(normalizeCondition("VG+"), "Very Good");
assert.equal(normalizeCondition("Good"), "Good");
assert.equal(normalizeCondition("Acceptable"), "Acceptable");
assert.equal(normalizeCondition("Poor / Reading Copy"), "Acceptable");
assert.equal(normalizeCondition("https://schema.org/UsedCondition"), "Good");
assert.equal(normalizeCondition(null), "Good");
console.log("  ✓ Condition normalization passed.");

// Test 2: Realistic Browser Headers
console.log("Test 2: Realistic Browser Headers...");
const headers = getRealisticBrowserHeaders("https://www.thriftbooks.com/browse/?b.search=9780140449136");
assert.ok(headers["User-Agent"]);
assert.ok(headers["User-Agent"].includes("Mozilla/5.0"));
assert.ok(headers["Accept"]);
assert.ok(headers["Accept-Language"]);
assert.equal(headers["Host"], "www.thriftbooks.com");
console.log("  ✓ Browser headers passed.");

// Test 3: JSON-LD Extraction & Offer Parsing
console.log("Test 3: JSON-LD Extraction & Parsing...");
const mockHtmlWithJsonLd = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Book",
    "name": "The Great Gatsby",
    "author": {
      "@type": "Person",
      "name": "F. Scott Fitzgerald"
    },
    "offers": [
      {
        "@type": "Offer",
        "price": "4.99",
        "priceCurrency": "USD",
        "itemCondition": "https://schema.org/UsedCondition",
        "availability": "https://schema.org/InStock"
      },
      {
        "@type": "Offer",
        "price": "14.95",
        "priceCurrency": "USD",
        "itemCondition": "https://schema.org/NewCondition",
        "availability": "https://schema.org/InStock"
      }
    ]
  }
  </script>
</head>
<body>
</body>
</html>
`;

const blocks = extractJsonLdBlocks(mockHtmlWithJsonLd);
assert.equal(blocks.length, 1);
const offers = parseOffersFromJsonLd(blocks);
assert.equal(offers.length, 2);
assert.equal(offers[0].price, 4.99);
assert.equal(offers[0].condition, "Good");
assert.equal(offers[1].price, 14.95);
assert.equal(offers[1].condition, "New");
console.log("  ✓ JSON-LD offer extraction passed.");

// Test 4: OpenGraph / Microdata Extraction
console.log("Test 4: Meta / Microdata extraction...");
const mockOgHtml = `
<html>
<head>
  <meta property="og:price:amount" content="8.75">
  <meta property="og:price:currency" content="USD">
</head>
</html>
`;
assert.equal(extractMetaPrice(mockOgHtml), 8.75);

const mockMicrodataHtml = `
<html>
<body>
  <div itemprop="price" content="6.50">$6.50</div>
</body>
</html>
`;
assert.equal(extractMetaPrice(mockMicrodataHtml), 6.50);
console.log("  ✓ Meta / Microdata extraction passed.");

// Test 5: ThriftBooks details extraction
console.log("Test 5: ThriftBooks details extraction...");
const mockTbHtml = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Dune",
    "author": "Frank Herbert",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "7.29",
      "priceCurrency": "USD",
      "offerCount": "12"
    }
  }
  </script>
</head>
<body>
  <script>
    dataLayer = [{
      "item_name": "Dune",
      "item_author": "Frank Herbert",
      "item_category": "Science Fiction"
    }];
  </script>
</body>
</html>
`;

const tbResult = extractThriftbooksDetails(mockTbHtml);
assert.equal(tbResult.title, "Dune");
assert.equal(tbResult.author, "Frank Herbert");
assert.equal(tbResult.price, 7.29);
assert.equal(tbResult.category, "Science Fiction");
console.log("  ✓ ThriftBooks extraction passed.");

// Test 6: AbeBooks price extraction
console.log("Test 6: AbeBooks price extraction...");
const mockAbeHtml = `
<div class="result-data">
  <div data-test-id="listing-price" class="item-price">US$ 5.40</div>
</div>
`;
const abeResult = extractAbeBooksPrice(mockAbeHtml);
assert.equal(abeResult.price, 5.4);
console.log("  ✓ AbeBooks extraction passed.");

console.log("\nALL TESTS PASSED SUCCESSFULLY! ✨");

