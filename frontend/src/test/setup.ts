import "@testing-library/jest-dom/vitest";

// jsdom implements no layout, so it ships no scrollIntoView. Components that
// keep a conversation scrolled to the newest message call it on every render,
// and would otherwise throw here for a reason that has nothing to do with what
// is being tested.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
