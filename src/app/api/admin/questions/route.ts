import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);

  const bankId = req.nextUrl.searchParams.get("bankId");
  const section = req.nextUrl.searchParams.get("section");
  const difficulty = req.nextUrl.searchParams.get("difficulty");
  const q = req.nextUrl.searchParams.get("q");

  if (!bankId) {
    return jsonError("bankId query param is required");
  }

  const questions = await prisma.question.findMany({
    where: {
      bankId,
      ...(section ? { section } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(q
        ? {
            OR: [
              { text: { contains: q, mode: "insensitive" } },
              { key: { contains: q, mode: "insensitive" } },
              { id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ key: "asc" }, { createdAt: "asc" }],
  });

  return jsonOk({
    questions: questions.map((question) => ({
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
      answer: question.answer ? JSON.parse(question.answer) : null,
      rubric: question.rubric ? JSON.parse(question.rubric) : null,
    })),
    total: questions.length,
  });
}

const importSchema = z.object({
  bankId: z.string().min(1),
  questions: z.array(
    z.object({
      id: z.string().optional(),
      key: z.string().optional(),
      section: z.string(),
      difficulty: z.string(),
      type: z.enum(["mcq", "multi", "open"]),
      question: z.string(),
      code: z.string().optional(),
      options: z.array(z.string()).optional(),
      answer: z.union([z.number(), z.array(z.number())]).optional(),
      explanation: z.string().optional(),
      rubric: z.array(z.string()).optional(),
      points: z.number().optional(),
    })
  ),
  pointsByDifficulty: z
    .record(z.string(), z.number())
    .optional()
    .default({ easy: 1, medium: 2, hard: 3 }),
  openEndedPoints: z.number().optional().default(10),
  preview: z.boolean().optional(),
  /** If true, replace all questions in the bank with this import */
  replace: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid import");
  }

  const bank = await prisma.questionBank.findUnique({
    where: { id: parsed.data.bankId },
  });
  if (!bank) return jsonError("Bank not found", 404);

  if (parsed.data.preview) {
    return jsonOk({
      preview: true,
      bankId: bank.id,
      count: parsed.data.questions.length,
      sample: parsed.data.questions.slice(0, 5).map((q) => ({
        key: q.key ?? q.id,
        type: q.type,
        section: q.section,
        text: q.question.slice(0, 80),
      })),
    });
  }

  if (parsed.data.replace) {
    await prisma.question.deleteMany({ where: { bankId: bank.id } });
  }

  let upserted = 0;
  for (const q of parsed.data.questions) {
    const key = q.key ?? q.id ?? null;
    const points =
      q.type === "open"
        ? (q.points ?? parsed.data.openEndedPoints)
        : parsed.data.pointsByDifficulty[q.difficulty] ?? 1;

    const data = {
      section: q.section,
      difficulty: q.difficulty,
      type: q.type,
      text: q.question,
      code: q.code ?? null,
      options: q.options ? JSON.stringify(q.options) : null,
      answer: q.answer !== undefined ? JSON.stringify(q.answer) : null,
      explanation: q.explanation ?? null,
      rubric: q.rubric ? JSON.stringify(q.rubric) : null,
      points,
    };

    if (key) {
      const existing = await prisma.question.findFirst({
        where: { bankId: bank.id, key },
      });
      if (existing) {
        await prisma.question.update({ where: { id: existing.id }, data });
      } else {
        await prisma.question.create({
          data: { bankId: bank.id, key, ...data },
        });
      }
    } else {
      await prisma.question.create({
        data: { bankId: bank.id, ...data },
      });
    }
    upserted++;
  }

  const total = await prisma.question.count({ where: { bankId: bank.id } });
  return jsonOk({ upserted, total, bankId: bank.id });
}
