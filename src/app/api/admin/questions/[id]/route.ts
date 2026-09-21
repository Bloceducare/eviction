import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  section: z.string().min(1).optional(),
  difficulty: z.string().min(1).optional(),
  type: z.enum(["mcq", "multi", "open"]).optional(),
  text: z.string().min(1).optional(),
  code: z.string().nullable().optional(),
  options: z.array(z.string()).nullable().optional(),
  answer: z
    .union([z.number(), z.array(z.number()), z.null()])
    .optional(),
  explanation: z.string().nullable().optional(),
  rubric: z.array(z.string()).nullable().optional(),
  points: z.number().int().positive().optional(),
});

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return jsonError("Not found", 404);
  return jsonOk({
    question: {
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
      answer: question.answer ? JSON.parse(question.answer) : null,
      rubric: question.rubric ? JSON.parse(question.rubric) : null,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.section !== undefined) data.section = d.section;
  if (d.difficulty !== undefined) data.difficulty = d.difficulty;
  if (d.type !== undefined) data.type = d.type;
  if (d.text !== undefined) data.text = d.text;
  if (d.code !== undefined) data.code = d.code;
  if (d.options !== undefined) {
    data.options = d.options ? JSON.stringify(d.options) : null;
  }
  if (d.answer !== undefined) {
    data.answer = d.answer !== null ? JSON.stringify(d.answer) : null;
  }
  if (d.explanation !== undefined) data.explanation = d.explanation;
  if (d.rubric !== undefined) {
    data.rubric = d.rubric ? JSON.stringify(d.rubric) : null;
  }
  if (d.points !== undefined) data.points = d.points;

  const question = await prisma.question.update({ where: { id }, data });
  return jsonOk({
    question: {
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
      answer: question.answer ? JSON.parse(question.answer) : null,
      rubric: question.rubric ? JSON.parse(question.rubric) : null,
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  await prisma.question.delete({ where: { id } });
  return jsonOk({ ok: true });
}
