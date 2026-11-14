import { notFound, redirect } from "next/navigation";
import { FarmApp, type FarmView } from "@/components/farm-app";

export default async function FarmPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { view } = await params;
  if (view === "simulation") redirect("/assistant?workspace=simulation");
  if (!["assistant", "agents", "orders", "tasks", "connections"].includes(view))
    notFound();
  const query = await searchParams;
  return (
    <FarmApp
      initialTab={view as FarmView}
      workspace={query.workspace === "simulation" ? "simulation" : "live"}
    />
  );
}
