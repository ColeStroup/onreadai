import type { Metadata } from "next";
import { PartnerPolicyPage } from "@/components/partners/partner-policy-page";
import { brand, createMarketingMetadata } from "@/lib/brand";
import { promotionStandardsSections } from "@/lib/partners/policy-content";
export const metadata: Metadata = createMarketingMetadata({ title: `Partner Promotion Standards | ${brand.name}`, description: "Evidence, disclosure, outreach, and product-claim standards for partners.", pathname: "/partners/promotion-standards" });
export default function Page() { return <PartnerPolicyPage eyebrow="Partner Program" title="Promotion Standards" summary="Clear disclosure, accurate evidence, professional outreach, and claims that stay within the product's actual capabilities." sections={promotionStandardsSections} />; }
