import { cancelJob, getJob, hasValidApiToken } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  if (!hasValidApiToken(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const job = getJob(id);
  return job ? Response.json({ job }) : Response.json({ error: "Job not found" }, { status: 404 });
}

export async function DELETE(request: Request, context: Context) {
  if (!hasValidApiToken(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const job = await cancelJob(id);
  return job ? Response.json({ job }) : Response.json({ error: "Job not found" }, { status: 404 });
}
