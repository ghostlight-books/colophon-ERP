import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDeweyCategory,
  resolveLocSubject,
  cleanDeweyNumber,
  cleanLocNumber,
} from "../libraryClassification.service.js";

describe("Library Classification Engine", () => {
  describe("Dewey Decimal Category Mapping", () => {
    it("maps 800s to Literature", () => {
      const category = resolveDeweyCategory("813.54");
      assert.equal(category, "800 - Literature, Poetry & Drama");
    });

    it("maps 000s to Computer Science & General", () => {
      const category = resolveDeweyCategory("005.13");
      assert.equal(category, "000 - Computer Science, Information & General Works");
    });

    it("maps 500s to Pure Science & Mathematics", () => {
      const category = resolveDeweyCategory("530.12");
      assert.equal(category, "500 - Pure Science & Mathematics");
    });

    it("maps 900s to History, Geography & Biography", () => {
      const category = resolveDeweyCategory("973.92");
      assert.equal(category, "900 - History, Geography & Biography");
    });

    it("cleans messy Dewey strings with slashes and brackets", () => {
      assert.equal(cleanDeweyNumber("813/.54"), "813.54");
      assert.equal(cleanDeweyNumber("813.54 [20]"), "813.54");
      assert.equal(cleanDeweyNumber(""), null);
      assert.equal(cleanDeweyNumber(null), null);
    });
  });

  describe("Library of Congress Call Number Mapping", () => {
    it("maps PS to Language & Literature (American)", () => {
      const subject = resolveLocSubject("PS3558.E63 D86 2004");
      assert.equal(subject, "P - Language & Literature (PR=English, PS=American, PN=Literature)");
    });

    it("maps QA to Science & Mathematics", () => {
      const subject = resolveLocSubject("QA76.73.J38");
      assert.equal(subject, "Q - Science & Mathematics (QA=Computer Science, QC=Physics)");
    });

    it("maps H to Social Sciences, Business & Economics", () => {
      const subject = resolveLocSubject("HB171.5 .M47 2018");
      assert.equal(subject, "H - Social Sciences, Business & Economics");
    });

    it("cleans messy LOC strings", () => {
      assert.equal(cleanLocNumber("  PS3558.E63   D86  "), "PS3558.E63 D86");
      assert.equal(cleanLocNumber(""), null);
      assert.equal(cleanLocNumber(null), null);
    });
  });
});
