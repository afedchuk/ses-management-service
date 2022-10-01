#!/bin/bash

set -e

echo "Your bash version is $BASH_VERSION."

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
read -r -p "Set SES sender email: " SENDER
read -r -p "Set SES email destination for notifications: " DESTINATION

function createBucket() {
  BUCKET_EXISTS=$(aws s3api head-bucket --bucket $DEPLOYMENT_BUCKET 2>&1 || true)
  if [ -z "$BUCKET_EXISTS" ]; then
    echo "Bucket $DEPLOYMENT_BUCKET already exists"
  else
    aws s3api create-bucket --bucket $DEPLOYMENT_BUCKET --region $REGION --create-bucket-configuration LocationConstraint=$REGION
  fi
}

function tag() {
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
aws sts get-caller-identity | jq .Account
function sns() {
  export TOPIC="ses-business-support"
  arn=$(aws sns create-topic --name $TOPIC --output text || error_exit "Failed to create an SNS Topic, Check Output")
}

function strip_quotes() {
  while [[ $# -gt 0 ]]; do
    local value=${!1}
    local len=${#value}
    [[ ${value:0:1} == \" && ${value:$len-1:1} == \" ]] && declare -g $1="${value:1:$len-2}"
    shift
  done
}

accountId=$(aws sts get-caller-identity | jq .Account)
strip_quotes accountId
function alarm() {
  export DAILY_SES_QUOTA=$(aws ses get-send-quota | jq .Max24HourSend)
  declare -A metrics=([WARNING]=0.2 [ALERT]=0.5)
  echo $accountId
  for metric in "${!metrics[@]}"; do
    $(
      aws cloudwatch put-metric-alarm \
        --alarm-name "${metric}: Daily SES Complaint Count as ${metrics[$metric]}%" \
        --alarm-description "Daily SES Complaint Count is currently at ${metrics[$metric]}%, review complaints logs." \
        --namespace "AWS/SES" \
        --metric-name "Complaint" \
        --statistic "Sum" \
        --alarm-actions "arn:aws:sns:$REGION:$accountId:ses-business-support" \
        --evaluation-periods 1 \
        --comparison-operator "GreaterThanOrEqualToThreshold" \
        --period "86400" \
        --threshold $(printf '(%s+1)/1\n' "$DAILY_SES_QUOTA / 100 * ${metrics[$metric]}" | bc)
    )
  done
}

echo "Setup serverless..."
npm install
npm install -g serverless
echo "Creating bucket, creating tags..."
createBucket
tag

echo "Setting up SNS to receive notifications..."
sns

echo "Setting up notifications metrics..."
alarm

echo "Deploying service to AWS.."
sls deploy --param="bucket=$DEPLOYMENT_BUCKET" --param="sender=$SENDER" --param="destination=$DESTINATION"
