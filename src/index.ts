import { createCliCommand } from "./cli/build-command.ts";

const runCli = async (): Promise<void> => {
  try {
    await createCliCommand().parseAsync();
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? `${error.message}\n`
        : "Unknown CLI error\n";
    process.stderr.write(message);
    process.exitCode = 1;
  }
};

runCli();
