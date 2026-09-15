import { Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { API_REPOSITORY_NAME } from './toolchain-stack.js';
import { assertEeaRegion } from './eea-region.js';
import {
  environmentConfig,
  type EnvironmentName,
} from './environment.js';

export type PhotoprintStackProps = StackProps & {
  readonly environmentName: EnvironmentName;
  readonly imageTag: string;
};

export class PhotoprintStack extends Stack {
  constructor(scope: Construct, id: string, props: PhotoprintStackProps) {
    super(scope, id, props);

    const region = props.env?.region;
    if (region === undefined) {
      throw new Error('PhotoprintStack requires env.region (FR-SEC-005)');
    }
    assertEeaRegion(region);

    const config = environmentConfig(props.environmentName);
    const removalPolicy = config.deletionProtection
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: config.natGateways,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    const appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      description: `Photoprint ${config.name} application secrets (FR-SEC-001)`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'MYSQL_PASSWORD',
        excludePunctuation: true,
        passwordLength: 32,
      },
      removalPolicy,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSg', {
      vpc,
      allowAllOutbound: false,
      description: 'Aurora MySQL',
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc,
      allowAllOutbound: false,
      description: 'ElastiCache Redis',
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSg', {
      vpc,
      description: 'ECS Fargate API',
    });

    dbSecurityGroup.addIngressRule(
      serviceSecurityGroup,
      ec2.Port.tcp(3306),
      'API to Aurora',
    );
    redisSecurityGroup.addIngressRule(
      serviceSecurityGroup,
      ec2.Port.tcp(6379),
      'API to Redis',
    );

    const database = new rds.DatabaseCluster(this, 'Aurora', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_08_0,
      }),
      credentials: rds.Credentials.fromPassword(
        'photoprint',
        appSecret.secretValueFromJson('MYSQL_PASSWORD'),
      ),
      writer: rds.ClusterInstance.serverlessV2('writer'),
      serverlessV2MinCapacity: config.auroraMinCapacity,
      serverlessV2MaxCapacity: config.auroraMaxCapacity,
      defaultDatabaseName: 'photoprint',
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      storageEncrypted: true,
      deletionProtection: config.deletionProtection,
      removalPolicy,
      backup: {
        retention: config.deletionProtection ? Duration.days(7) : Duration.days(1),
      },
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(
      this,
      'RedisSubnets',
      {
        description: `Photoprint ${config.name} Redis`,
        subnetIds: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }).subnetIds,
      },
    );

    const redis = new elasticache.CfnCacheCluster(this, 'Redis', {
      engine: 'redis',
      cacheNodeType: 'cache.t4g.micro',
      numCacheNodes: 1,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      engineVersion: '7.1',
    });

    const assets = new s3.Bucket(this, 'Assets', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: config.deletionProtection,
      removalPolicy,
      autoDeleteObjects: !config.deletionProtection,
    });

    const repository = ecr.Repository.fromRepositoryName(
      this,
      'ApiRepository',
      API_REPOSITORY_NAME,
    );

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'Api',
      {
        cluster,
        cpu: 512,
        memoryLimitMiB: 1024,
        desiredCount: config.desiredCount,
        publicLoadBalancer: true,
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [serviceSecurityGroup],
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(
            repository,
            props.imageTag,
          ),
          containerPort: 3000,
          family: `photoprint-api-${config.name}`,
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: 'api',
            logRetention: logs.RetentionDays.ONE_MONTH,
          }),
          environment: {
            NODE_ENV: 'production',
            PORT: '3000',
            AWS_REGION: region,
            SECRETS_MANAGER_SECRET_ID: appSecret.secretArn,
            MYSQL_HOST: database.clusterEndpoint.hostname,
            MYSQL_PORT: database.clusterEndpoint.port.toString(),
            MYSQL_USER: 'photoprint',
            MYSQL_DATABASE: 'photoprint',
            REDIS_HOST: redis.attrRedisEndpointAddress,
            REDIS_PORT: redis.attrRedisEndpointPort,
            ASSETS_BUCKET: assets.bucketName,
          },
        },
        circuitBreaker: { rollback: true },
      },
    );

    service.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
    });

    appSecret.grantRead(service.taskDefinition.taskRole);
    assets.grantReadWrite(service.taskDefinition.taskRole);
    repository.grantPull(service.taskDefinition.obtainExecutionRole());

    Tags.of(this).add('service', 'photoprint');
    Tags.of(this).add('environment', config.name);
  }
}
