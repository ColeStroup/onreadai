import type { Metadata } from "next";
import { PartnerPolicyPage } from "@/components/partners/partner-policy-page";
import { brand, createMarketingMetadata } from "@/lib/brand";
import { partnerTermsSections } from "@/lib/partners/policy-content";
export const metadata: Metadata = createMarketingMetadata({ title: `Partner Terms | ${brand.name}`, description: "Draft terms for independent Certified Growth Partners.", pathname: "/partners/terms" });
export default function Page() { return <PartnerPolicyPage eyebrow="Partner Program" title="Partner Terms" summary="The operating relationship, customer-account boundary, standards, and responsibilities for independent Certified Growth Partners." sections={partnerTermsSections} />; }
