#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { DEFAULT_EEA_REGION, assertEeaRegion } from '../lib/eea-region.js';
import { ENVIRONMENT_NAMES } from '../lib/environment.js';
import { PhotoprintStage } from '../lib/photoprint-stage.js';
import { ToolchainStack } from '../lib/toolchain-stack.js';

const app = new App();
const region = process.env['CDK_DEFAULT_REGION'] ?? DEFAULT_EEA_REGION;
assertEeaRegion(region);

const account = process.env['CDK_DEFAULT_ACCOUNT'];
const env =
  account === undefined || account === ''
    ? { region }
    : { account, region };

const imageTagRaw = app.node.tryGetContext('imageTag');
const imageTag =
  typeof imageTagRaw === 'string' && imageTagRaw !== ''
    ? imageTagRaw
    : 'synth';

new ToolchainStack(app, 'PhotoprintToolchain', {
  env,
  stackName: 'photoprint-toolchain',
});

for (const name of ENVIRONMENT_NAMES) {
  new PhotoprintStage(app, stageId(name), {
    env,
    environmentName: name,
    imageTag,
  });
}

function stageId(name: (typeof ENVIRONMENT_NAMES)[number]): string {
  switch (name) {
    case 'dev':
      return 'PhotoprintDev';
    case 'staging':
      return 'PhotoprintStaging';
    case 'production':
      return 'PhotoprintProduction';
  }
}
