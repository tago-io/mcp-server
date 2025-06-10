import {
  App,
  aws_apigateway as apigateway,
  aws_certificatemanager as acm,
  aws_lambda as lambda,
  aws_route53 as route53,
  aws_route53_targets as targets,
  CfnOutput,
  Duration,
  Stack,
} from "aws-cdk-lib";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

/**
 * Constants
 */
const middlewareName = process.env.MIDDLEWARE_NAME;
const port = process.env.PORT || "8000";
const hostedZoneId = process.env.HOSTED_ZONE_ID;
const logLevel = (process.env.LOG_LEVEL || "INFO") as "DEBUG" | "INFO" | "WARNING" | "ERROR";

if (!middlewareName) {
  throw new Error("MIDDLEWARE_NAME and MIDDLEWARE_TOKEN must be set");
}
if (!hostedZoneId) {
  throw new Error("HOSTED_ZONE_ID must be set");
}

const zoneName = "middleware.tago.io";

/**
 * App
 */
const app = new App();
const stackName = `${middlewareName}stack`;

// Create main stack in target region
const mainStack = new Stack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
});

const httpMiddlewareFunction = new NodejsFunction(mainStack, "HttpMiddlewareFunction", {
  runtime: lambda.Runtime.NODEJS_22_X,
  functionName: `${middlewareName}-prod-HttpMiddleware`,
  handler: "index.handler",
  entry: path.join(__dirname, "../src/start.ts"), // Path to your Lambda entry point
  bundling: {
    minify: true, // Minify code
    sourceMap: true, // Enable source maps for better debugging
    externalModules: [
      "aws-sdk", // Exclude AWS SDK as it's available in the Lambda runtime
    ],
    format: OutputFormat.CJS, // Use ES modules
    target: "node22",
    esbuildArgs: {
      "--tree-shaking": "true",
    },
  },
  environment: {
    LOG_LEVEL: logLevel,
    PORT: port,
    NODE_ENV: "production",
  },
  logRetention: RetentionDays.ONE_WEEK,
  timeout: Duration.seconds(30),
  memorySize: 1024,
});

// Define the API Gateway
const api = new apigateway.LambdaRestApi(mainStack, "ApiGateway", {
  handler: httpMiddlewareFunction,
  restApiName: `${middlewareName}-prod-ApiGateway`,
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowHeaders: ["Content-Type", "Cache-Control", "X-Requested-With", "Authorization", "X-Downlink-URL", "X-API-Key"],
  },
  deployOptions: {
    stageName: "prod",
    metricsEnabled: true,
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
  },
  deploy: true,
});

// Lookup the existing hosted zone
const hostedZone = route53.HostedZone.fromHostedZoneAttributes(mainStack, "HostedZone", {
  hostedZoneId: hostedZoneId,
  zoneName: zoneName,
});

// Create certificate in the same stack
const certificate = new acm.Certificate(mainStack, "Certificate", {
  domainName: `${middlewareName}.${zoneName}`,
  validation: acm.CertificateValidation.fromDns(hostedZone),
});

// Create a custom domain for the API Gateway
const domainName = new apigateway.DomainName(mainStack, "CustomDomain", {
  domainName: `${middlewareName}.${zoneName}`,
  certificate: certificate,
  endpointType: apigateway.EndpointType.EDGE,
  securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
});

new apigateway.BasePathMapping(mainStack, "ApiMapping", {
  domainName: domainName,
  restApi: api,
  stage: api.deploymentStage,
});

// Create a Route 53 alias record for the custom domain
new route53.ARecord(mainStack, "ApiAliasRecord", {
  zone: hostedZone,
  recordName: `${middlewareName}.${zoneName}`,
  target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(domainName)),
});

new route53.AaaaRecord(mainStack, "ApiAliasRecordIPv6", {
  zone: hostedZone,
  recordName: middlewareName,
  target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(domainName)),
});

// Output the API URL
new CfnOutput(mainStack, "ApiUrl", {
  value: api.url,
  description: "The URL of the API Gateway",
});

new CfnOutput(mainStack, "CustomDomainUrl", {
  value: `https://${middlewareName}.${zoneName}`,
  description: "The custom domain URL",
});

app.synth();
