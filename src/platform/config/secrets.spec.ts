import { afterEach, describe, expect, it } from 'vitest';
import {
  environmentSecretStore,
  loadSecretsAtStartup,
  parseSecretPayload,
  resetLoadedSecretsForTests,
  resolveRequiredSecrets,
  secret,
  secretStoreForRuntime,
  secretsManagerStore,
} from './secrets.js';

afterEach(() => {
  resetLoadedSecretsForTests();
});

describe('resolveRequiredSecrets', () => {
  it('fails loudly when a required secret is absent — never a default', async () => {
    const store = environmentSecretStore({});

    await expect(resolveRequiredSecrets(store)).rejects.toThrow(
      /MYSQL_PASSWORD/,
    );
    await expect(resolveRequiredSecrets(store)).rejects.toThrow(
      /Never use a default/,
    );
  });

  it('treats an empty string as absent', async () => {
    const store = environmentSecretStore({ MYSQL_PASSWORD: '' });
    await expect(resolveRequiredSecrets(store)).rejects.toThrow(
      /MYSQL_PASSWORD/,
    );
  });

  it('returns the environment value in non-production', async () => {
    const secrets = await resolveRequiredSecrets(
      environmentSecretStore({ MYSQL_PASSWORD: 'local-only' }),
    );
    expect(secrets.MYSQL_PASSWORD).toBe('local-only');
  });
});

describe('secretStoreForRuntime', () => {
  it('does not fall back to the environment in production', async () => {
    await expect(
      secretStoreForRuntime({
        NODE_ENV: 'production',
        MYSQL_PASSWORD: 'from-env',
      }),
    ).rejects.toThrow(/AWS_REGION/);
  });

  it('loads named keys from Secrets Manager in production', async () => {
    const store = await secretStoreForRuntime(
      {
        NODE_ENV: 'production',
        AWS_REGION: 'eu-west-1',
        SECRETS_MANAGER_SECRET_ID: 'photoprint/app',
      },
      async () => ({ MYSQL_PASSWORD: 'from-sm' }),
    );
    const secrets = await resolveRequiredSecrets(store);
    expect(secrets.MYSQL_PASSWORD).toBe('from-sm');
  });

  it('fails when Secrets Manager omits a required key', async () => {
    const store = await secretStoreForRuntime(
      {
        NODE_ENV: 'production',
        AWS_REGION: 'eu-west-1',
        SECRETS_MANAGER_SECRET_ID: 'photoprint/app',
      },
      async () => ({}),
    );
    await expect(resolveRequiredSecrets(store)).rejects.toThrow(
      /MYSQL_PASSWORD/,
    );
  });
});

describe('parseSecretPayload', () => {
  it('rejects non-JSON and non-object payloads', () => {
    expect(() => parseSecretPayload('not-json')).toThrow(/JSON/);
    expect(() => parseSecretPayload('["x"]')).toThrow(/JSON object/);
    expect(() => parseSecretPayload('{"MYSQL_PASSWORD":1}')).toThrow(/string/);
  });
});

describe('loadSecretsAtStartup', () => {
  it('exposes secrets only after a successful load', async () => {
    expect(() => secret('MYSQL_PASSWORD')).toThrow(/have not been loaded/);

    await loadSecretsAtStartup(
      { NODE_ENV: 'development' },
      secretsManagerStore({ MYSQL_PASSWORD: 'at-boot' }),
    );
    expect(secret('MYSQL_PASSWORD')).toBe('at-boot');
  });
});
