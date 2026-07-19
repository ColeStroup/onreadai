import type { Metadata } from "next";
import { PartnerPolicyPage } from "@/components/partners/partner-policy-page";
import { brand, createMarketingMetadata } from "@/lib/brand";
import { commissionPolicySections } from "@/lib/partners/policy-content";
export const metadata: Metadata = createMarketingMetadata({ title: `Partner Commission Policy | ${brand.name}`, description: "Referral attribution, commission eligibility, holds, reversals, and manual payouts.", pathname: "/partners/commission-policy" });
export default function Page() { return <PartnerPolicyPage eyebrow="Partner Program" title="Commission Policy" summary="How eligible referral payments create, hold, reverse, and become available for manual partner payouts." sections={commissionPolicySections} />; }
