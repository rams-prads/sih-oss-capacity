import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (path.endsWith(".tsx") && !path.includes(".test.")) found.push(path);
  }
  return found;
}

describe("the icon set", () => {
  const components = Object.entries(icons).filter(([name]) => name.endsWith("Icon"));

  it("covers everything the interface needs", () => {
    expect(components.length).toBeGreaterThanOrEqual(15);
  });

  it("renders every icon as an inline svg", () => {
    for (const [name, Icon] of components) {
      const { container, unmount } = render(<Icon />);
      const svg = container.querySelector("svg");
      expect(svg, `${name} did not render an svg`).not.toBeNull();
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      unmount();
    }
  });

  it("inherits colour rather than hard-coding it", () => {
    // An icon with a baked-in colour cannot sit on both the paper background
    // and the near-black player chrome.
    const source = readFileSync(join("src", "components", "icons.tsx"), "utf8");
    expect(source).not.toMatch(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/);
  });

  it("hides decorative icons from screen readers unless given a title", () => {
    const { container } = render(<icons.PlayIcon />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    const titled = render(<icons.PlayIcon title="Play" />);
    expect(titled.container.querySelector("svg")?.getAttribute("aria-hidden")).toBeNull();
    expect(titled.container.querySelector("title")?.textContent).toBe("Play");
  });
});

describe("the interface", () => {
  /**
   * Emoji render differently on every platform, carry colour the design does
   * not control, and read as decoration in an interface meant to be quiet.
   * Typographic punctuation - an em dash, a middle dot, an arrow inside a
   * sentence - is not an icon and is allowed.
   */
  it("uses no emoji or glyph icons", () => {
    const allowed = new Set([..."\u2019\u2018\u201c\u201d\u2014\u2013\u2026\u00a0\u00b7\u2192"]);
    const offenders: string[] = [];

    for (const file of sourceFiles(join("src"))) {
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        for (const character of line) {
          if (character.codePointAt(0)! > 0x2000 && !allowed.has(character)) {
            offenders.push(`${file}:${index + 1} ${character}`);
          }
        }
        // Escaped forms hide from the eye but render the same.
        for (const match of line.matchAll(/\u([0-9a-fA-F]{4})/g)) {
          const character = String.fromCharCode(parseInt(match[1], 16));
          if (!allowed.has(character)) offenders.push(`${file}:${index + 1} ${match[0]}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
