import { notFound } from "next/navigation";
import { getConsoleDataProvider } from "../../../lib/providers";
import { InvocationDetail, SourceFailure, pageNumber, type SearchParams } from "../../../components/tables/gateway-audit";

export default async function InvocationPage({ params, searchParams }: { params: Promise<{ invocationId: string }>; searchParams: Promise<SearchParams> }) {
  const { invocationId } = await params;
  if (!/^[a-f0-9]{32}$/.test(invocationId)) notFound();
  const snapshot = await (await getConsoleDataProvider()).getSnapshot();
  if (snapshot.source.status && snapshot.source.status !== "ready") return <div className="p-6"><h1 className="sr-only">Invocation details</h1><SourceFailure source={snapshot.source} /></div>;
  const invocation = snapshot.gateway?.invocations.find(item => item.invocationId === invocationId);
  if (!invocation) notFound();
  return <InvocationDetail invocation={invocation} page={pageNumber((await searchParams).page)} />;
}
