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

type BankFile = {
  meta: {
    title?: string;
    pointsByDifficulty: Record<string, number>;
    openEndedPoints: number;
  };
  questions: RawQuestion[];
};

async function main() {
  const bankPath = path.join(process.cwd(), "web3_exam_questions.json");
  const file: BankFile = JSON.parse(fs.readFileSync(bankPath, "utf-8"));
  const { pointsByDifficulty, openEndedPoints } = file.meta;
  const bankName = file.meta.title ?? "Web3Bridge Default Bank";

  const bank = await prisma.questionBank.upsert({
    where: { id: "seed-default-bank" },
    create: {
      id: "seed-default-bank",
      name: bankName,
      description: "Seeded from web3_exam_questions.json",
    },
    update: {
      name: bankName,
      description: "Seeded from web3_exam_questions.json",
    },
  });

  let upserted = 0;
  for (const q of file.questions) {
    const points =
      q.type === "open"
        ? (q.points ?? openEndedPoints)
        : pointsByDifficulty[q.difficulty] ?? 1;

    const existing = await prisma.question.findFirst({
      where: { bankId: bank.id, key: q.id },
    });

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

    if (existing) {
      await prisma.question.update({ where: { id: existing.id }, data });
    } else {
      await prisma.question.create({
        data: {
          bankId: bank.id,
          key: q.id,
          ...data,
        },
      });
    }
    upserted++;
  }

  console.log(`Seeded bank "${bank.name}" (${bank.id}) with ${upserted} questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
