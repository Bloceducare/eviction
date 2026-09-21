import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Question } from "@prisma/client";
import { gradeAttempt } from "../src/lib/grading";
import {
  sanitizeQuestion,
  assertNoSecrets,
  unshuffleIndex,
  unshuffleIndices,
} from "../src/lib/sanitize";

function q(
  partial: Partial<Question> &
    Pick<Question, "id" | "type" | "points" | "answer">
): Question {
  return {
    section: "fundamentals",
    difficulty: "easy",
    text: "Q",
    code: null,
    options: JSON.stringify(["a", "b", "c", "d"]),
    explanation: "secret",
    rubric: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("sanitizeQuestion", () => {
  it("strips answer/explanation/rubric", () => {
    const out = sanitizeQuestion(
      q({
        id: "f01",
        type: "mcq",
        points: 1,
        answer: "1",
        explanation: "nope",
        rubric: JSON.stringify(["r"]),
      })
    );
    assert.equal(out.id, "f01");
    assert.ok(!("answer" in out));
    assert.ok(!("explanation" in out));
    assert.ok(!("rubric" in out));
  });

  it("applies option shuffle for display", () => {
    const out = sanitizeQuestion(
      q({ id: "f01", type: "mcq", points: 1, answer: "0" }),
      [3, 2, 1, 0]
    );
    assert.deepEqual(out.options, ["d", "c", "b", "a"]);
  });

  it("assertNoSecrets throws on leaked keys", () => {
    assert.throws(() => assertNoSecrets({ answer: 1 }));
    assert.doesNotThrow(() =>
      assertNoSecrets({ questions: [{ id: "f01", text: "hi" }] })
    );
  });
});

describe("unshuffle", () => {
  it("maps display index back to original", () => {
    const order = [2, 0, 1];
    assert.equal(unshuffleIndex(0, order), 2);
    assert.deepEqual(unshuffleIndices([0, 2], order), [1, 2]);
  });
});

describe("gradeAttempt", () => {
  it("scores mcq with shuffled options", () => {
    const questions = [
      q({ id: "m1", type: "mcq", points: 2, answer: JSON.stringify(1) }),
    ];
    const result = gradeAttempt({
      questions,
      answers: { m1: 1 },
      optionOrder: { m1: [2, 1, 0, 3] },
    });
    assert.equal(result.autoScore, 2);
    assert.equal(result.details.m1.correct, true);
  });

  it("scores multi as exact match only", () => {
    const questions = [
      q({
        id: "x",
        type: "multi",
        points: 3,
        answer: JSON.stringify([0, 2]),
      }),
    ];
    assert.equal(
      gradeAttempt({ questions, answers: { x: [0] }, optionOrder: {} })
        .autoScore,
      0
    );
    assert.equal(
      gradeAttempt({
        questions,
        answers: { x: [0, 2] },
        optionOrder: {},
      }).autoScore,
      3
    );
  });

  it("leaves open questions for manual scoring", () => {
    const questions = [
      q({
        id: "o1",
        type: "open",
        points: 10,
        answer: null,
        options: null,
        rubric: JSON.stringify(["a"]),
      }),
    ];
    const result = gradeAttempt({
      questions,
      answers: { o1: "essay" },
      optionOrder: {},
    });
    assert.equal(result.autoScore, 0);
    assert.equal(result.maxAutoPoints, 0);
  });
});
