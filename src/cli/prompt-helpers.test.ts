import { describe, expect, test } from "bun:test";

import {
  ABORT_OPTION,
  createCountParser,
  promptForBigIntString,
  promptForCount,
  promptForInteger,
} from "./prompt-helpers.ts";

const PROVIDED_RESULT = 7;
const DEFAULT_PROMPT = 2;
const PROMPT_VALUE = "5";
const INVALID_VALUE = "not-a-number";
const VALID_COUNT_INPUT = "3";
const VALID_COUNT_EXPECTED = 3;
const INTEGER_DEFAULT = 4;
const MINIMUM_INTEGER = 1;

const stubInput = (responses: string[]) => {
  let index = 0;
  return ((config: unknown) => {
    const value = responses[index++];
    if (value === undefined) {
      throw new Error("No more stub responses available");
    }
    const response = Promise.resolve(value) as Promise<string> & {
      cancel: () => void;
    };
    response.cancel = () => {
      if (typeof config === "object" && config && "cancel" in (config as any)) {
        // no-op but ensures shape compatibility with prompt interface
      }
    };
    return response;
  }) as typeof import("@inquirer/prompts").input;
};

describe("prompt helpers", () => {
  test("createCountParser validates input", () => {
    const parser = createCountParser("Validators");
    expect(parser(VALID_COUNT_INPUT)).toBe(VALID_COUNT_EXPECTED);
    expect(() => parser("-1")).toThrow(
      "Validators must be a non-negative integer."
    );
  });

  test("promptForCount honours provided value", async () => {
    const result = await promptForCount(
      "validators",
      PROVIDED_RESULT,
      DEFAULT_PROMPT,
      stubInput([])
    );
    expect(result).toBe(PROVIDED_RESULT);
  });

  test("promptForCount returns default when response is blank", async () => {
    const result = await promptForCount(
      "validators",
      undefined,
      DEFAULT_PROMPT,
      stubInput([""])
    );
    expect(result).toBe(DEFAULT_PROMPT);
  });

  test("promptForCount retries until valid input", async () => {
    const responses = [INVALID_VALUE, PROMPT_VALUE];
    const result = await promptForCount(
      "validators",
      undefined,
      DEFAULT_PROMPT,
      stubInput(responses)
    );
    expect(result).toBe(Number.parseInt(PROMPT_VALUE, 10));
  });

  test("promptForCount aborts on sentinel", async () => {
    await expect(
      promptForCount(
        "validators",
        undefined,
        DEFAULT_PROMPT,
        stubInput([ABORT_OPTION])
      )
    ).rejects.toThrow("Provide CLI flags to skip interactivity.");
  });

  test("promptForInteger falls back to default after invalid input", async () => {
    const responses = ["not-a-number", "0", "", "7"];
    const result = await promptForInteger({
      defaultValue: INTEGER_DEFAULT,
      labelText: "Example",
      message: "Example",
      min: MINIMUM_INTEGER,
      prompt: stubInput(responses),
    });
    expect(result).toBe(INTEGER_DEFAULT);
  });

  test("promptForBigIntString enforces positive integers", async () => {
    const responses = ["bad", "0", "123"];
    const result = await promptForBigIntString({
      defaultValue: "500",
      labelText: "Big",
      message: "Big",
      prompt: stubInput(responses),
    });
    expect(result).toBe("123");
  });

  test("promptForInteger aborts when sentinel provided", async () => {
    await expect(
      promptForInteger({
        defaultValue: MINIMUM_INTEGER,
        labelText: "Abort",
        message: "Abort",
        min: MINIMUM_INTEGER,
        prompt: stubInput([ABORT_OPTION]),
      })
    ).rejects.toThrow(`Abort aborted via ${ABORT_OPTION}.`);
  });
});
