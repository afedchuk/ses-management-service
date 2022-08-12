#!/bin/bash

set -e

# Verify AWS CLI Credentials are setup
# http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html
if ! grep -q aws_access_key_id ~/.aws/config; then
  if ! grep -q aws_access_key_id ~/.aws/credentials; then
    echo "AWS config not found or CLI not installed. Please run \"aws configure\"."
    exit 1
  fi
fi

read -r -p "Set deployment bucket name: " DEPLOYMENT_BUCKET
read -r -p "Set AWS region: " REGION

function createBucket(){
  BUCKET_EXISTS=$(aws s3api head-bucket --bucket $DEPLOYMENT_BUCKET 2>&1 || true)
  if [ -z "$BUCKET_EXISTS" ]; then
    echo "Bucket $DEPLOYMENT_BUCKET already exists"
  else
    aws s3api create-bucket --bucket $DEPLOYMENT_BUCKET --region $REGION --create-bucket-configuration LocationConstraint=$REGION
  fi
}

function tag(){
	aws s3api put-bucket-tagging --bucket $DEPLOYMENT_BUCKET --tagging \
	'{
		"TagSet": [
			{
				"Key": "Lambda deployment bucket",
				"Value": "'$DEPLOYMENT_BUCKET'"
			}
		]
	}'
}

echo "Setup serverless..."
npm install
npm install -g serverless
echo "Creating bucket, creating tags..."
createBucket
tag
echo "Deploying service to AWS.."
sls deploy --param="bucket=$DEPLOYMENT_BUCKET"
