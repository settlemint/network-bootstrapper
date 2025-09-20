import { input as inputPrompt } from "@inquirer/prompts";
import { InvalidArgumentError } from "commander";

import { accent } from "./bootstrap.colors.ts";

const ABORT_OPTION = "▌" as const;
const ABORT_MESSAGE = `Prompt aborted via ${ABORT_OPTION}. Provide CLI flags to skip interactivity.`;

type InputPrompt = typeof inputPrompt;

const toCount = (value: string): number | undefined => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return;
  }
  return parsed;
};

const ensureNotAborted = (value: string, labelText: string): string => {
  if (value === ABORT_OPTION) {
    throw new Error(`${labelText} aborted via ${ABORT_OPTION}.`);
  }
  return value;
};

const createCountParser =
  (labelText: string) =>
  (value: string): number => {
    const parsed = toCount(value);
    if (parsed === undefined) {
      throw new InvalidArgumentError(
        `${labelText} must be a non-negative integer.`
      );
    }
    return parsed;
  };

const promptForCount = async (
  labelText: string,
  provided: number | undefined,
  defaultValue: number,
  prompt: InputPrompt = inputPrompt
): Promise<number> => {
  if (provided !== undefined) {
    return provided;
  }

  const message = accent(
    `How many ${labelText}? (enter ${ABORT_OPTION} to abort)`
  );

  // Allow users to retry until a valid response or abort sentinel is provided.
  for (;;) {
    const response = (
      await prompt({
        message,
        default: `${defaultValue}`,
      })
    )
      .toString()
      .trim();

    if (response.length === 0) {
      return defaultValue;
    }

    if (response === ABORT_OPTION) {
      throw new Error(ABORT_MESSAGE);
    }

    const parsed = toCount(response);
    if (parsed !== undefined) {
      return parsed;
    }

    process.stdout.write(
      `${labelText} must be a non-negative integer or ${ABORT_OPTION} to abort.\n`
    );
  }
};

type IntegerPromptOptions = {
  defaultValue: number;
  labelText: string;
  message: string;
  min: number;
  prompt?: InputPrompt;
};

const promptForInteger = async ({
  defaultValue,
  labelText,
  message,
  min,
  prompt = inputPrompt,
}: IntegerPromptOptions): Promise<number> => {
  const formattedMessage = accent(
    `${message} (enter ${ABORT_OPTION} to abort)`
  );

  for (;;) {
    const raw = (
      await prompt({
        message: formattedMessage,
        default: `${defaultValue}`,
      })
    )
      .toString()
      .trim();

    if (raw.length === 0) {
      return defaultValue;
    }

    ensureNotAborted(raw, labelText);

    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed >= min) {
      return parsed;
    }

    process.stdout.write(
      `${labelText} must be an integer >= ${min} or ${ABORT_OPTION} to abort.\n`
    );
  }
};

const promptForBigIntString = async ({
  defaultValue,
  labelText,
  message,
  prompt = inputPrompt,
}: {
  defaultValue: string;
  labelText: string;
  message: string;
  prompt?: InputPrompt;
}): Promise<string> => {
  const formattedMessage = accent(
    `${message} (enter ${ABORT_OPTION} to abort)`
  );

  for (;;) {
    const raw = (
      await prompt({
        message: formattedMessage,
        default: defaultValue,
      })
    )
      .toString()
      .trim();

    if (raw.length === 0) {
      return defaultValue;
    }

    ensureNotAborted(raw, labelText);

    try {
      const parsed = BigInt(raw);
      if (parsed > 0n) {
        return raw;
      }
      process.stdout.write(
        `${labelText} must be a positive integer or ${ABORT_OPTION} to abort.\n`
      );
    } catch (_error) {
      process.stdout.write(
        `${labelText} must be a positive integer or ${ABORT_OPTION} to abort.\n`
      );
    }
  }
};

type TextPromptOptions = {
  allowEmpty?: boolean;
  defaultValue: string;
  labelText: string;
  message: string;
  prompt?: InputPrompt;
};

const promptForText = async ({
  allowEmpty = false,
  defaultValue,
  labelText,
  message,
  prompt = inputPrompt,
}: TextPromptOptions): Promise<string> => {
  const formattedMessage = accent(
    `${message} (enter ${ABORT_OPTION} to abort)`
  );

  for (;;) {
    const raw = (
      await prompt({
        message: formattedMessage,
        default: defaultValue,
      })
    )
      .toString()
      .trim();

    if (raw.length === 0) {
      if (allowEmpty) {
        return "";
      }
      return defaultValue;
    }

    ensureNotAborted(raw, labelText);

    if (raw.length > 0) {
      return raw;
    }

    process.stdout.write(
      `${labelText} must be a non-empty value or ${ABORT_OPTION} to abort.\n`
    );
  }
};

export type { InputPrompt };
export {
  ABORT_OPTION,
  ABORT_MESSAGE,
  createCountParser,
  promptForBigIntString,
  promptForCount,
  promptForInteger,
  promptForText,
};
