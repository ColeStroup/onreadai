import { redirect } from "next/navigation";

type BusinessPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function BusinessPage({ params }: BusinessPageProps) {
  const { businessId } = await params;

  redirect(`/dashboard/businesses/${businessId}/overview`);
}
