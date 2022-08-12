# ses-management-service

Service provide functionality to some SES statistics and identities management.

## Requirements

This is a `nodejs` project which requires use `node` of version 14 or higher,
`npm`.

## Deployment

Make sure you already have `aws cli` and `npm` installed.
To deploy an application to AWS run `deploy.sh` script or `npm run aws-deploy` and follow instructions.

## API endpoints description

1. Get SES quotes information:
   `GET http://{hosted_url}}/info`
2. Get identities verified:
   `GET https://{hosted_url}}/identities`
3. Add a new domain/email identity:
   `POST https://{hosted_url}}/identities/{identity}`
4. Delete an existing identity:
   `Delete https://{hosted_url}}/identities/{identity}`

## Authentication

None

## How to set up and run locally

Follow these steps to get started:
- set up and configure `aws` cli to have access to aws services linked in the project
- use `npm install` to install all dependencies
- run serverless command to run project locally: `sls offline  --stage development --noPrependStageInUrl --param="bucket=bucket-name"`

It'll start server locally for testing.

## Logging
The logs from service automatically are placing to `cloudwatch` for all log levels, each of functions has own log groups.
