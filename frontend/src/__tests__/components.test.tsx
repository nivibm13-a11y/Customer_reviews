import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { KpiCard } from "@/components/charts/Charts";
import { AnalysisProgress, CsvDropzone } from "@/components/upload/UploadParts";
import { ThemeProvider } from "@/context/ThemeContext";
import { useReviewFilters } from "@/pages/ReviewsPage";
import { cleanParams } from "@/services/reviewLensService";
import type { Upload } from "@/types";

function wrap(ui: ReactNode, path = "/") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const baseUpload: Upload = {
  id: 1,
  business_id: 1,
  filename: "reviews_week40.csv",
  status: "processing",
  total_rows: 250,
  valid_rows: 248,
  dropped_rows: 2,
  duplicates_skipped: 0,
  processed_count: 120,
  needs_review_count: 0,
  error_message: null,
  created_at: "2026-10-05T10:00:00Z",
  completed_at: null,
  progress_pct: 48.4,
};

describe("AnalysisProgress", () => {
  it("shows live progress counts", () => {
    wrap(<AnalysisProgress upload={baseUpload} />);
    expect(screen.getByTestId("progress-count")).toHaveTextContent("120 / 248 analysed");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "48");
    expect(screen.getByText(/AI is reading/)).toBeInTheDocument();
  });

  it("shows needs-review warning and errors", () => {
    wrap(
      <AnalysisProgress
        upload={{ ...baseUpload, status: "failed", needs_review_count: 3, error_message: "Analysis failed: boom" }}
      />,
    );
    expect(screen.getByText(/3 review\(s\) need a manual check/)).toBeInTheDocument();
    expect(screen.getByText("Analysis failed: boom")).toBeInTheDocument();
  });
});

describe("CsvDropzone", () => {
  it("passes the dropped CSV file to onFile", async () => {
    const onFile = vi.fn();
    wrap(<CsvDropzone onFile={onFile} />);
    const file = new File(["review_id,date,platform,rating,review_text\n"], "reviews.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText("Upload CSV file"), file);
    await vi.waitFor(() => expect(onFile).toHaveBeenCalledWith(file));
  });
});

describe("KpiCard", () => {
  it("marks a drop in urgent reviews as an improvement", () => {
    wrap(<KpiCard label="Urgent" value="9" delta={-3} goodDirection="down" icon={null} />);
    expect(screen.getByLabelText(/Improved vs last week: -3/)).toBeInTheDocument();
  });

  it("marks a drop in positive % as worse", () => {
    wrap(<KpiCard label="Positive" value="61%" delta={-4.5} goodDirection="up" deltaSuffix=" pts" icon={null} />);
    expect(screen.getByLabelText(/Worse vs last week: -4.5 pts/)).toBeInTheDocument();
  });

  it("explains when there is no previous week", () => {
    wrap(<KpiCard label="Total" value="248" delta={null} goodDirection="up" icon={null} />);
    expect(screen.getByText("no previous week")).toBeInTheDocument();
  });
});

function FilterProbe() {
  const { filters, setFilter, active } = useReviewFilters();
  const location = useLocation();
  return (
    <div>
      <span data-testid="urgency">{filters.urgency ?? "none"}</span>
      <span data-testid="active">{active}</span>
      <span data-testid="search">{location.search}</span>
      <button type="button" onClick={() => setFilter("urgency", filters.urgency === "high" ? undefined : "high")}>
        toggle high
      </button>
    </div>
  );
}

describe("useReviewFilters (HIGH urgency toggle)", () => {
  it("toggles urgency=high in the URL and resets the page", async () => {
    wrap(
      <Routes>
        <Route path="/reviews" element={<FilterProbe />} />
      </Routes>,
      "/reviews?page=3&category=delivery",
    );
    expect(screen.getByTestId("urgency")).toHaveTextContent("none");
    await userEvent.click(screen.getByText("toggle high"));
    expect(screen.getByTestId("urgency")).toHaveTextContent("high");
    expect(screen.getByTestId("search").textContent).not.toContain("page=");
    expect(screen.getByTestId("active")).toHaveTextContent("2");
    await userEvent.click(screen.getByText("toggle high"));
    expect(screen.getByTestId("urgency")).toHaveTextContent("none");
  });
});

describe("cleanParams", () => {
  it("drops empty values", () => {
    expect(cleanParams({ a: "x", b: "", c: undefined, d: 0 })).toEqual({ a: "x", d: 0 });
  });
});
