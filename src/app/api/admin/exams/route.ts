import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";
import {
  defaultExamConfig,
  examConfigSchema,
  generateAccessCode,
} from "@/lib/exam-config";

async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) return null;
  return admin;
}

export async function GET() {
  if (!(await requireAdmin())) return jsonError("Unauthorized", 401);
  const exams = await prisma.exam.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { attempts: true } } },
  });
  return jsonOk({ exams });
}

const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  durationMinutes: z.number().int().min(5).max(480).default(90),
  accessCode: z.string().trim().min(4).max(12).optional(),
  config: examConfigSchema.partial().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  let accessCode = (parsed.data.accessCode ?? generateAccessCode()).toUpperCase();
  // Ensure uniqueness
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.exam.findUnique({ where: { accessCode } });
    if (!clash) break;
    accessCode = generateAccessCode();
  }

  const config = {
    ...defaultExamConfig,
    ...parsed.data.config,
  };

  const exam = await prisma.exam.create({
    data: {
      title: parsed.data.title,
      durationMinutes: parsed.data.durationMinutes,
      accessCode,
      status: "DRAFT",
      config: JSON.stringify(config),
    },
  });

  return jsonOk({ exam });
}
