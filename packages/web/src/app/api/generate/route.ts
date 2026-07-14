import { createJob, hasValidApiToken, validateSettings } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidApiToken(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const job = await createJob(validateSettings(await request.json()));
    return Response.json({ job, migration: "Use /api/jobs and the job event stream for progress." }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid generation request" }, { status: 400 });
  }
}
