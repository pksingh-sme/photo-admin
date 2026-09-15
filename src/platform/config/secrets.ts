import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/**
 * Credential material resolved at process startup. (`FR-SEC-001`)
 *
 * Production reads AWS Secrets Manager. Everywhere else reads the
 * environment. Missing values throw — there is no default, including an
 * empty string.
 */
export const REQUIRED_SECRETS = ['MYSQL_PASSWORD'] as const;

export type SecretName = (typeof REQUIRED_SECRETS)[number];

export type ResolvedSecrets = { readonly [K in SecretName]: string };

export type SecretStore = {
  get(name: SecretName): Promise<string | undefined>;
};

let loaded: ResolvedSecrets | undefined;

const MISSING_SECRET =
  'is absent. Set it in the environment (local) or Secrets Manager (production). Never use a default. (FR-SEC-001)';

export function isProductionNodeEnv(
  nodeEnv: string | undefined = process.env['NODE_ENV'],
): boolean {
  return nodeEnv === 'production';
}

export async function resolveRequiredSecrets(
  store: SecretStore,
): Promise<ResolvedSecrets> {
  const resolved: Partial<Record<SecretName, string>> = {};

  for (const name of REQUIRED_SECRETS) {
    const value = await store.get(name);
    if (value === undefined || value === '') {
      throw new Error(`Required secret ${name} ${MISSING_SECRET}`);
    }
    resolved[name] = value;
  }

  if (!hasAllSecrets(resolved)) {
    throw new Error(`Required secret MYSQL_PASSWORD ${MISSING_SECRET}`);
  }

  return resolved;
}

export function environmentSecretStore(
  env: NodeJS.ProcessEnv = process.env,
): SecretStore {
  return {
    get(name) {
      const value = env[name];
      return Promise.resolve(value);
    },
  };
}

export function secretsManagerStore(
  payload: Readonly<Record<string, string>>,
): SecretStore {
  return {
    get(name) {
      return Promise.resolve(payload[name]);
    },
  };
}

export async function loadJsonObjectFromSecretsManager(args: {
  region: string;
  secretId: string;
  client?: SecretsManagerClient;
}): Promise<Record<string, string>> {
  const client =
    args.client ?? new SecretsManagerClient({ region: args.region });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: args.secretId }),
  );
  const raw = response.SecretString;
  if (raw === undefined || raw === '') {
    throw new Error(
      'Secrets Manager returned an empty SecretString (FR-SEC-001)',
    );
  }
  return parseSecretPayload(raw);
}

export function parseSecretPayload(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      'Secrets Manager payload must be JSON with named secret keys (FR-SEC-001)',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'Secrets Manager payload must be a JSON object (FR-SEC-001)',
    );
  }

  const entries = Object.entries(parsed);
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== 'string') {
      throw new Error(
        `Secrets Manager key ${key} must be a string (FR-SEC-001)`,
      );
    }
    out[key] = value;
  }
  return out;
}

export async function secretStoreForRuntime(
  env: NodeJS.ProcessEnv = process.env,
  readSecretsManager: (args: {
    region: string;
    secretId: string;
  }) => Promise<Record<string, string>> = (args) =>
    loadJsonObjectFromSecretsManager(args),
): Promise<SecretStore> {
  if (!isProductionNodeEnv(env['NODE_ENV'])) {
    return environmentSecretStore(env);
  }

  const region = requiredConfig(env, 'AWS_REGION');
  const secretId = requiredConfig(env, 'SECRETS_MANAGER_SECRET_ID');
  const payload = await readSecretsManager({ region, secretId });
  return secretsManagerStore(payload);
}

export async function loadSecretsAtStartup(
  env: NodeJS.ProcessEnv = process.env,
  store?: SecretStore,
): Promise<ResolvedSecrets> {
  const resolvedStore = store ?? (await secretStoreForRuntime(env));
  const secrets = await resolveRequiredSecrets(resolvedStore);
  loaded = secrets;
  return secrets;
}

export function secret(name: SecretName): string {
  if (loaded === undefined) {
    throw new Error('Secrets have not been loaded at startup (FR-SEC-001)');
  }
  return loaded[name];
}

function requiredConfig(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is required in production to resolve secrets (FR-SEC-001)`,
    );
  }
  return value;
}

export function resetLoadedSecretsForTests(): void {
  loaded = undefined;
}

function hasAllSecrets(
  value: Partial<Record<SecretName, string>>,
): value is ResolvedSecrets {
  return REQUIRED_SECRETS.every((name) => {
    const item = value[name];
    return item !== undefined && item !== '';
  });
}
