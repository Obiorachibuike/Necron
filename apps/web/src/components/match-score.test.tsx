import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatchScore, ScoreBreakdown } from "./match-score";

describe("MatchScore", () => {
  it("shows a real score with its category label in text, not only colour", () => {
    render(<MatchScore score={86.4} category="strong_match" />);
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    // The bar is a graphic; assistive tech gets the value from the aria-label.
    expect(screen.getByRole("img", {
      name: "Strong match: 86 out of 100",
    })).toBeInTheDocument();
  });

  it("never presents a fabricated number when nothing could be assessed", () => {
    render(<MatchScore score={50} category="insufficient_data" />);
    expect(screen.getByText("Not enough data to score")).toBeInTheDocument();
    expect(screen.queryByText("50")).not.toBeInTheDocument();
    expect(screen.queryByText(/stretch/i)).not.toBeInTheDocument();
  });

  it("distinguishes 'not scored yet' from 'not enough data'", () => {
    render(<MatchScore score={null} category={undefined} />);
    expect(screen.getByText("Not scored yet")).toBeInTheDocument();
  });

  it("labels every backend category, including low matches", () => {
    const cases: [string, string][] = [
      ["worth_considering", "Worth considering"],
      ["stretch", "Stretch"],
      ["low_match", "Low match"],
    ];
    for (const [category, label] of cases) {
      const { unmount } = render(<MatchScore score={42} category={category} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the rationale for each scoring category", () => {
    render(<ScoreBreakdown breakdown={[
      { category: "skills", label: "Technical skills", weight: 30, score: 72,
        rationale: "6 of 9 required skills verified." },
      { category: "salary", label: "Salary compatibility", weight: 5, score: null,
        rationale: "The listing does not state a salary range." },
    ]} />);
    expect(screen.getByText("6 of 9 required skills verified.")).toBeInTheDocument();
    expect(screen.getByText("The listing does not state a salary range.")).toBeInTheDocument();
    expect(screen.getByText(/not enough data/)).toBeInTheDocument();
  });
});
