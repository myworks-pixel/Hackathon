import { FarmApp } from "@/components/farm-app";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const query = await searchParams;
  return (
    <FarmApp
      workspace={query.workspace === "simulation" ? "simulation" : "live"}
    />
  );
}
