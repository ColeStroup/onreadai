import type { Metadata } from "next";
import { PartnerPolicyPage } from "@/components/partners/partner-policy-page";
import { brand, createMarketingMetadata } from "@/lib/brand";
import { scannerPolicySections } from "@/lib/partners/policy-content";
export const metadata: Metadata = createMarketingMetadata({ title: `Partner Scanner Policy | ${brand.name}`, description: "Fair-use and evidence standards for the bounded public Partner Scanner.", pathname: "/partners/scanner-policy" });
export default function Page() { return <PartnerPolicyPage eyebrow="Partner Program" title="Scanner Policy" summary="The scanner's limited purpose, technical boundaries, fair-use controls, and responsible outreach requirements." sections={scannerPolicySections} />; }
