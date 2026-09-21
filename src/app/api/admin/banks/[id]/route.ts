import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;

  const bank = await prisma.questionBank.findUnique({
    where: { id },
    include: { _count: { select: { questions: true } } },
  });
  if (!bank) return jsonError("Not found", 404);
  return jsonOk({ bank });
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input");

  const bank = await prisma.questionBank.update({
    where: { id },
    data: parsed.data,
  });
  return jsonOk({ bank });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  await prisma.questionBank.delete({ where: { id } });
  return jsonOk({ ok: true });
}
