const AWS = require('aws-sdk');
const ses = new AWS.SESV2({apiVersion: '2019-09-27'});

/**
 * Get SES identities
 */
const getIdentities = async () => {
  try {
    let verifiedIdentities = [];
    let nextToken = '';
    do {
      const response = await ses.listEmailIdentities({PageSize: 10, NextToken: nextToken}).promise();
      if (response && response.EmailIdentities.length > 0) {
        nextToken = response.NextToken;
        response.EmailIdentities.map(identity => {
          if (identity.SendingEnabled) verifiedIdentities = [...verifiedIdentities, ...[identity.IdentityName]];
        });
      }
    } while (nextToken);

    return verifiedIdentities;
  } catch (e) {
    console.log(`Could not fetch SES identities.`);
  }

  return [];
};

/**
 * Get account quotes
 */
const getQuotes = async () => {
  let result = {};

  try {
    const quotes = await ses.getAccount().promise();
    const {EnforcementStatus, ProductionAccessEnabled} = quotes;
    const {Max24HourSend, SentLast24Hours} = quotes.SendQuota;
    result = {
      status: `AWS SES is ${EnforcementStatus.toLowerCase()}`,
      productionAccess: `Production access is ${ProductionAccessEnabled ? 'enabled' : 'disabled'}`,
      max24HourSend: `You have ${Max24HourSend} emails limit for last 24 hours.`,
      sentLast24Hours: `You already send ${SentLast24Hours} emails for last 24 hours.`,
    };
  } catch (e) {
    console.log(`Could not fetch SES account quotes.`);
  }

  return result;
};

const createIdentity = async (input) => {
  try {
    if (!input) return {
      statusCode: 422,
      body: JSON.stringify({message: "Please check your identity, it should be an email address or domain."})
    };

    const result = await ses.createEmailIdentity({
      EmailIdentity: input
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Identity successfully created.",
        data: {
          identityType: result.IdentityType,
          verifiedForSendingStatus: result.VerifiedForSendingStatus
        }
      })
    };
  } catch (e) {
    console.log(`Could not create SES identity. ${e.message}`);

    return {
      statusCode: 400,
      body: JSON.stringify({message: e.message})
    };
  }
};

const deleteIdentity = async (identity) => {
  try {
    await ses.deleteEmailIdentity({EmailIdentity: identity}).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Identity successfully deleted.",
      })
    };
  } catch (e) {
    console.log(`Could not delete SES identity. ${e.message}`);

    return {
      statusCode: 400,
      body: JSON.stringify({message: e.message})
    };
  }
};

/**
 * Handler for viewing quotes information
 * @param event
 * @param context
 * @param callback
 */
exports.handler = async (event, context, callback) => {
  const quotes = await getQuotes();
  let headers = {"Content-Type": "application/json"};

  callback(null, {
    statusCode: 200,
    body: JSON.stringify(quotes),
    headers
  });
};

/**
 * Handler for managing identities
 * @param event
 * @param context
 * @param callback
 */
exports.identityHandler = async (event, context, callback) => {
  const {identity = ''} = event.pathParameters ?? {};
  let result = {
    statusCode: 200,
    body: JSON.stringify({}),
  };

  if (event.httpMethod === 'GET') {
    const verifiedIdentities = await getIdentities();
    result.body = JSON.stringify({verifiedIdentities});
  } else if (event.httpMethod === 'POST') {
    result = await createIdentity(identity);
  } else if (event.httpMethod === 'DELETE') {
    result = await deleteIdentity(identity);
  } else {
    callback('Method not allowed.', {});
  }

  callback(null, {
    ...result,
    headers: {
      "Content-Type": "application/json"
    }
  });
};
