import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";

export async function GET() {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);

  const banks = await prisma.questionBank.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });

  return jsonOk({ banks });
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);

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

  const bank = await prisma.questionBank.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });

  return jsonOk({ bank });
}
