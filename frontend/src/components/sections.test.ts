import { describe, expect, it } from "vitest";
import { isPlaceholderSection, realSections } from "./sections";

describe("isPlaceholderSection", () => {
  it("knows a heading that only repeats the position of what is under it", () => {
    for (const title of [
      "Videos 1-5",
      "Videos 1–5",
      "Videos 6 - 10",
      "Course videos",
      "course video",
      "Module 3",
      "Section 2",
      "Unit 1",
      "Part 4.",
      "Untitled collection",
      "   ",
    ]) {
      expect(isPlaceholderSection(title), title).toBe(true);
    }
  });

  it("leaves a heading an author actually wrote", () => {
    for (const title of [
      "Sampling frames and coverage",
      "Measuring GDP",
      "Ethos : The First Pillar",
      "Introduction",
      "Structure of Unit Level Data",
    ]) {
      expect(isPlaceholderSection(title), title).toBe(false);
    }
  });
});

describe("realSections", () => {
  it("keeps sections a reader can use", () => {
    expect(realSections(["Measuring GDP", "Circular flow of income"])).toEqual([
      "Measuring GDP",
      "Circular flow of income",
    ]);
    expect(realSections(["Structure of Unit Level Data"])).toEqual(["Structure of Unit Level Data"]);
  });

  it("drops a set that is only numbering", () => {
    expect(realSections(["Videos 1-5", "Videos 6-10", "Videos 11-12"])).toEqual([]);
    expect(realSections(["Course videos"])).toEqual([]);
    expect(realSections([])).toEqual([]);
  });
});
