import { BookOpen, LifeBuoy } from "lucide-react";

import { HelpFaqSearch } from "@/components/dashboard/help-faq-search";
import { PageIntro } from "@/components/dashboard/report-ui";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardHelpPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageIntro
        eyebrow="Help"
        title="Help center"
        description="Practical explanations for website setup, audit evidence, SEO, Action Plans, the Consultant, and progress verification."
        icon={LifeBuoy}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <BookOpen className="mb-4 size-5 text-accent" />
            <p className="font-medium">Start with the flow</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Add and confirm a website, review context, choose a goal, run an
              audit, then work through the Action Plan.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <BookOpen className="mb-4 size-5 text-accent" />
            <p className="font-medium">Read the score as direction</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              The Website Growth Score helps orient you. Findings and evidence
              explain what to change next.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <BookOpen className="mb-4 size-5 text-accent" />
            <p className="font-medium">Confirm your context</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Check the Context tab so the AI understands your audience, offer,
              and conversion goal before giving advice.
            </p>
          </CardContent>
        </Card>
      </div>

      <HelpFaqSearch />
    </div>
  );
}
