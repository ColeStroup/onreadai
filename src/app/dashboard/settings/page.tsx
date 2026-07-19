import { Settings } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">
          Account settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Profile and workspace preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Settings className="size-5" />
          </div>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Basic account details from your session.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={user.name ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email ?? ""} readOnly />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
