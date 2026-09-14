import type { PersonaConfig } from "../contracts/campaign.js";
import type {
  PersonaLogin,
  PersonaModule,
  ResolvedPersonaAction,
} from "../contracts/persona.js";

export function resolveCampaignPersonas(
  personas: readonly PersonaConfig[],
  modules: Readonly<Record<string, PersonaModule>>,
): {
  login: PersonaLogin;
  actions: ResolvedPersonaAction[];
} {
  const actions: ResolvedPersonaAction[] = [];
  const logins: PersonaLogin[] = [];

  for (const persona of personas) {
    const module = modules[persona.name];
    if (module === undefined) {
      throw new Error(`unknown persona module: ${persona.name}`);
    }
    if (!logins.includes(module.login)) {
      logins.push(module.login);
    }
    for (const [name, actionWeight] of Object.entries(persona.actions)) {
      const run = module.actions[name];
      if (run === undefined) {
        throw new Error(
          `unknown action ${name} in persona module ${persona.name}`,
        );
      }
      actions.push({
        name,
        weight: persona.weight * actionWeight,
        run,
      });
    }
  }

  const login = logins[0];
  if (login === undefined || actions[0] === undefined) {
    throw new Error("campaign personas resolved to an empty action table");
  }
  if (logins.length > 1) {
    throw new Error(
      "campaign personas must share one login (one target app per campaign)",
    );
  }

  return { login, actions };
}
