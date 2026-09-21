import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);

  const section = req.nextUrl.searchParams.get("section");
  const difficulty = req.nextUrl.searchParams.get("difficulty");
  const q = req.nextUrl.searchParams.get("q");

  const questions = await prisma.question.findMany({
    where: {
      ...(section ? { section } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(q
        ? {
            OR: [
              { text: { contains: q } },
              { id: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
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
  questions: z.array(
    z.object({
      id: z.string(),
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

  if (parsed.data.preview) {
    return jsonOk({
      preview: true,
      count: parsed.data.questions.length,
      sample: parsed.data.questions.slice(0, 5).map((q) => ({
        id: q.id,
        type: q.type,
        section: q.section,
        text: q.question.slice(0, 80),
      })),
    });
  }

  let upserted = 0;
  for (const q of parsed.data.questions) {
    const points =
      q.type === "open"
        ? (q.points ?? parsed.data.openEndedPoints)
        : parsed.data.pointsByDifficulty[q.difficulty] ?? 1;

    await prisma.question.upsert({
      where: { id: q.id },
      create: {
        id: q.id,
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
      },
      update: {
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
      },
    });
    upserted++;
  }

  return jsonOk({ upserted });
}
