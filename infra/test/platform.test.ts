import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { PhotoprintStack } from '../lib/photoprint-stack.js';
import { environmentConfig } from '../lib/environment.js';

const env = { account: '111111111111', region: 'eu-central-1' as const };

const azContext = {
  'availability-zones:account=111111111111:region=eu-central-1': [
    'eu-central-1a',
    'eu-central-1b',
  ],
};

function templateFor(
  environmentName: 'dev' | 'staging' | 'production',
): Template {
  const app = new App({ context: azContext });
  const stack = new PhotoprintStack(app, `Test-${environmentName}`, {
    env,
    environmentName,
    imageTag: 'test',
  });
  return Template.fromStack(stack);
}

describe('Aurora Serverless v2 scale-to-zero', () => {
  it('is enabled on dev and staging only', () => {
    assert.equal(environmentConfig('dev').auroraScaleToZero, true);
    assert.equal(environmentConfig('staging').auroraScaleToZero, true);
    assert.equal(environmentConfig('production').auroraScaleToZero, false);
    assert.equal(environmentConfig('dev').auroraMinCapacity, 0);
    assert.equal(environmentConfig('staging').auroraMinCapacity, 0);
    assert.ok(environmentConfig('production').auroraMinCapacity > 0);
  });

  it('synthesizes min capacity 0 for dev and 0.5 for production', () => {
    templateFor('dev').hasResourceProperties('AWS::RDS::DBCluster', {
      ServerlessV2ScalingConfiguration: Match.objectLike({
        MinCapacity: 0,
      }),
    });
    templateFor('staging').hasResourceProperties('AWS::RDS::DBCluster', {
      ServerlessV2ScalingConfiguration: Match.objectLike({
        MinCapacity: 0,
      }),
    });
    templateFor('production').hasResourceProperties('AWS::RDS::DBCluster', {
      ServerlessV2ScalingConfiguration: Match.objectLike({
        MinCapacity: 0.5,
      }),
    });
  });
});

describe('Graviton runtime', () => {
  it('runs the API task on ARM64', () => {
    templateFor('production').hasResourceProperties(
      'AWS::ECS::TaskDefinition',
      {
        RuntimePlatform: Match.objectLike({
          CpuArchitecture: 'ARM64',
        }),
      },
    );
  });
});
