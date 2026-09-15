/**
 * EEA AWS regions only. (`FR-SEC-005`)
 *
 * London (eu-west-2) is the UK, not the EEA. Zurich (eu-central-2) is
 * Switzerland, not the EEA. Neither is allowed.
 */
export const EEA_REGIONS = [
  'eu-central-1',
  'eu-west-1',
  'eu-west-3',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
] as const;

export type EeaRegion = (typeof EEA_REGIONS)[number];

export const DEFAULT_EEA_REGION: EeaRegion = 'eu-central-1';

export function isEeaRegion(region: string): region is EeaRegion {
  return (EEA_REGIONS as readonly string[]).includes(region);
}

export function assertEeaRegion(region: string): asserts region is EeaRegion {
  if (!isEeaRegion(region)) {
    throw new Error(
      `FR-SEC-005: ${region} is not an EEA AWS region. Allowed: ${EEA_REGIONS.join(', ')}`,
    );
  }
}
