import { DisclosureSection } from "@/components/dashboard/disclosure-section";

type ContextualHelpCardProps = {
  title: string;
  description: string;
};

export function ContextualHelpCard({
  title,
  description,
}: ContextualHelpCardProps) {
  return (
    <DisclosureSection
      title="How this works"
      description={title}
      compact
      className="border-dashed"
    >
      <p className="text-sm leading-6 text-muted">{description}</p>
    </DisclosureSection>
  );
}
