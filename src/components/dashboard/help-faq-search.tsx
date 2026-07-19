"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { helpSections } from "@/lib/education/help-content";

export function HelpFaqSearch() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!normalizedQuery) {
      return helpSections;
    }

    return helpSections
      .map((section) => {
        const sectionMatches =
          section.title.toLowerCase().includes(normalizedQuery) ||
          section.description.toLowerCase().includes(normalizedQuery);
        const entries = section.entries.filter(
          (entry) =>
            sectionMatches ||
            entry.question.toLowerCase().includes(normalizedQuery) ||
            entry.answer.toLowerCase().includes(normalizedQuery),
        );

        return { ...section, entries };
      })
      .filter((section) => section.entries.length > 0);
  }, [normalizedQuery]);

  const totalResults = visibleSections.reduce(
    (total, section) => total + section.entries.length,
    0,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <label htmlFor="help-search" className="text-sm font-medium">
            Search help topics
          </label>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              id="help-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search context, scores, SEO, profiles, PDFs, re-audits..."
              className="pl-10"
            />
          </div>
          <p className="mt-3 text-sm text-muted">
            {normalizedQuery
              ? `${totalResults} matching topic${totalResults === 1 ? "" : "s"}`
              : "Browse quick explanations for the main dashboard features."}
          </p>
        </CardContent>
      </Card>

      {visibleSections.length > 0 ? (
        visibleSections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.entries.map((entry) => (
                <details
                  key={entry.question}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <summary className="cursor-pointer list-none font-medium">
                    {entry.question}
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {entry.answer}
                  </p>
                </details>
              ))}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="font-medium">No help topics matched that search.</p>
            <p className="mt-2 text-sm text-muted">
              Try searching for context, audit, SEO, social, competitors, PDF,
              or action plan.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
