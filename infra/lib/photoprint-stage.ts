import { Stage, type StageProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { assertEeaRegion } from './eea-region.js';
import type { EnvironmentName } from './environment.js';
import { PhotoprintStack } from './photoprint-stack.js';

export type PhotoprintStageProps = StageProps & {
  readonly environmentName: EnvironmentName;
  readonly imageTag: string;
};

export class PhotoprintStage extends Stage {
  constructor(scope: Construct, id: string, props: PhotoprintStageProps) {
    super(scope, id, props);
    const region = props.env?.region;
    if (region === undefined) {
      throw new Error('PhotoprintStage requires env.region (FR-SEC-005)');
    }
    assertEeaRegion(region);

    new PhotoprintStack(this, 'Platform', {
      env: props.env,
      stackName: `photoprint-${props.environmentName}-platform`,
      environmentName: props.environmentName,
      imageTag: props.imageTag,
    });
  }
}
