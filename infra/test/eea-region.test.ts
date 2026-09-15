import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { App } from 'aws-cdk-lib';
import { assertEeaRegion, isEeaRegion } from '../lib/eea-region.js';
import { PhotoprintStage } from '../lib/photoprint-stage.js';

describe('EEA region (FR-SEC-005)', () => {
  it('accepts Frankfurt and rejects London, Zurich, and us-east-1', () => {
    assert.equal(isEeaRegion('eu-central-1'), true);
    assert.equal(isEeaRegion('eu-west-1'), true);
    assert.equal(isEeaRegion('eu-west-2'), false);
    assert.equal(isEeaRegion('eu-central-2'), false);
    assert.equal(isEeaRegion('us-east-1'), false);
    assert.throws(() => assertEeaRegion('us-east-1'), /FR-SEC-005/);
  });

  it('refuses to synthesize a stage outside the EEA', () => {
    const app = new App();
    assert.throws(
      () =>
        new PhotoprintStage(app, 'Denied', {
          env: { account: '111111111111', region: 'us-east-1' },
          environmentName: 'dev',
          imageTag: 'test',
        }),
      /FR-SEC-005/,
    );
  });
});
