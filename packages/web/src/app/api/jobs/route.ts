import { checkRateLimit, createJob, hasValidApiToken, validateSettings } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidApiToken(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!checkRateLimit(client)) return Response.json({ error: "Generation rate limit exceeded" }, { status: 429 });
  try {
    const settings = validateSettings(await request.json());
    const job = await createJob(settings);
    return Response.json({ job }, { status: job.status === "completed" ? 200 : 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid generation request" }, { status: 400 });
  }
}
