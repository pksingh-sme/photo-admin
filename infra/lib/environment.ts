export const ENVIRONMENT_NAMES = ['dev', 'staging', 'production'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export type EnvironmentConfig = {
  readonly name: EnvironmentName;
  readonly auroraScaleToZero: boolean;
  readonly auroraMinCapacity: number;
  readonly auroraMaxCapacity: number;
  readonly deletionProtection: boolean;
  readonly desiredCount: number;
  readonly natGateways: number;
};

export function environmentConfig(name: EnvironmentName): EnvironmentConfig {
  if (name === 'production') {
    return {
      name,
      auroraScaleToZero: false,
      auroraMinCapacity: 0.5,
      auroraMaxCapacity: 16,
      deletionProtection: true,
      desiredCount: 2,
      natGateways: 2,
    };
  }

  return {
    name,
    auroraScaleToZero: true,
    auroraMinCapacity: 0,
    auroraMaxCapacity: 4,
    deletionProtection: false,
    desiredCount: 1,
    natGateways: 1,
  };
}
