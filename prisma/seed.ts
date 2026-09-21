import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

type RawQuestion = {
  id: string;
  section: string;
  difficulty: string;
  type: "mcq" | "multi" | "open";
  question: string;
  code?: string;
  options?: string[];
  answer?: number | number[];
  explanation?: string;
  rubric?: string[];
  points?: number;
};

type Bank = {
  meta: {
    pointsByDifficulty: Record<string, number>;
    openEndedPoints: number;
  };
  questions: RawQuestion[];
};

async function main() {
  const bankPath = path.join(process.cwd(), "web3_exam_questions.json");
  const bank: Bank = JSON.parse(fs.readFileSync(bankPath, "utf-8"));
  const { pointsByDifficulty, openEndedPoints } = bank.meta;

  let upserted = 0;
  for (const q of bank.questions) {
    const points =
      q.type === "open"
        ? (q.points ?? openEndedPoints)
        : pointsByDifficulty[q.difficulty] ?? 1;

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
        answer:
          q.answer !== undefined ? JSON.stringify(q.answer) : null,
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
        answer:
          q.answer !== undefined ? JSON.stringify(q.answer) : null,
        explanation: q.explanation ?? null,
        rubric: q.rubric ? JSON.stringify(q.rubric) : null,
        points,
      },
    });
    upserted++;
  }

  console.log(`Seeded ${upserted} questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
