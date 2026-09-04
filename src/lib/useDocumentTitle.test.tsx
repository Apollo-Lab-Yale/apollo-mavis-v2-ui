import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pageTitle } from "./streams";
import { useDocumentTitle } from "./useDocumentTitle";

function Page({ section }: { section?: string }) {
  useDocumentTitle(pageTitle(section));
  return null;
}

describe("useDocumentTitle", () => {
  it("sets document.title and follows prop changes", () => {
    const { rerender } = render(<Page />);
    expect(document.title).toBe("APOLLO MAVIS V2");
    rerender(<Page section="Teleop" />);
    expect(document.title).toBe("APOLLO MAVIS V2 · Teleop");
  });
});
