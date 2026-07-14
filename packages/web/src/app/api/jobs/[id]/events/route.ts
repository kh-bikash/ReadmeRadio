import { getJob, hasValidApiToken, subscribeToJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  if (!hasValidApiToken(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const initialJob = getJob(id);
  if (!initialJob) return Response.json({ error: "Job not found" }, { status: 404 });
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialJob)}\n\n`));
      if (["completed", "failed", "cancelled"].includes(initialJob.status)) {
        close();
        return;
      }
      unsubscribe = subscribeToJob(id, (job) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));
        if (["completed", "failed", "cancelled"].includes(job.status)) close();
      });
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 15000);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
