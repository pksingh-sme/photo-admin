import { Stack, type StackProps, Tags } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';
import { assertEeaRegion } from './eea-region.js';

export const API_REPOSITORY_NAME = 'photoprint-api';

export class ToolchainStack extends Stack {
  readonly apiRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const region = props.env?.region;
    if (region === undefined) {
      throw new Error('ToolchainStack requires env.region (FR-SEC-005)');
    }
    assertEeaRegion(region);

    this.apiRepository = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: API_REPOSITORY_NAME,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      lifecycleRules: [
        {
          description: 'Keep the most recent images',
          maxImageCount: 20,
        },
      ],
    });

    Tags.of(this).add('service', 'photoprint');
    Tags.of(this).add('stack', 'toolchain');
  }
}
