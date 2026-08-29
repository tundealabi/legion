export type CliCommand =
  | { command: "start"; configPath: string }
  | { command: "stop"; configPath: string }
  | { command: "scale"; configPath: string; botCount: number };

export function parseCliArgs(argv: string[]): CliCommand {
  let configPath = "config/campaign.yaml";
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "-c" || arg === "--config") {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error("missing path after --config");
      }
      configPath = next;
      index += 1;
      continue;
    }
    positionals.push(arg);
  }

  const command = positionals[0];
  if (command === "start") {
    return { command: "start", configPath };
  }
  if (command === "stop") {
    return { command: "stop", configPath };
  }
  if (command === "scale") {
    const raw = positionals[1];
    if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
      throw new Error("usage: legion scale <n> [-c campaign.yaml]");
    }
    return { command: "scale", configPath, botCount: Number(raw) };
  }

  throw new Error("usage: legion start|stop|scale <n> [-c campaign.yaml]");
}
