import { BookOpen, LifeBuoy } from "lucide-react";

import { HelpFaqSearch } from "@/components/dashboard/help-faq-search";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardHelpPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <LifeBuoy className="size-5" />
          </div>
          <CardTitle className="text-3xl">Help Center</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Practical explanations for reading your audit, confirming profiles,
            defining Business Context, tracking competitors, using the action
            plan, and sharing reports.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <BookOpen className="mb-4 size-5 text-accent" />
            <p className="font-medium">Start with the flow</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Add a business, confirm profiles, review context, choose goals,
              run an audit, then work through the action plan.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <BookOpen className="mb-4 size-5 text-accent" />
            <p className="font-medium">Read scores as direction</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Scores help you spot priorities. Recommendations explain what to
              change next.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <BookOpen className="mb-4 size-5 text-accent" />
            <p className="font-medium">Confirm your context</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Check the Context tab so the AI understands your audience,
              offer, and conversion goal before giving advice.
            </p>
          </CardContent>
        </Card>
      </div>

      <HelpFaqSearch />
    </div>
  );
}
