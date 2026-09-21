import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";
import { examConfigSchema, parseExamConfig } from "@/lib/exam-config";

type Ctx = { params: Promise<{ id: string }> };

async function requireAdmin() {
  return getAdminSession();
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await requireAdmin())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: { _count: { select: { attempts: true } } },
  });
  if (!exam) return jsonError("Not found", 404);
  return jsonOk({
    exam: { ...exam, config: parseExamConfig(exam.config) },
  });
}

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  accessCode: z.string().trim().min(4).max(12).optional(),
  status: z.enum(["DRAFT", "OPEN", "RUNNING", "CLOSED"]).optional(),
  config: examConfigSchema.partial().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await requireAdmin())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input");

  const existing = await prisma.exam.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  const data: Record<string, unknown> = {};
  if (parsed.data.title) data.title = parsed.data.title;
  if (parsed.data.durationMinutes)
    data.durationMinutes = parsed.data.durationMinutes;
  if (parsed.data.accessCode)
    data.accessCode = parsed.data.accessCode.toUpperCase();
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.config) {
    const current = parseExamConfig(existing.config);
    data.config = JSON.stringify({ ...current, ...parsed.data.config });
  }

  const exam = await prisma.exam.update({ where: { id }, data });
  return jsonOk({ exam: { ...exam, config: parseExamConfig(exam.config) } });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await requireAdmin())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  try {
    await prisma.exam.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    console.error("exam delete failed", e);
    return jsonError(
      "Could not delete exam. It may already be gone, or the database rejected the delete.",
      500
    );
  }
}
