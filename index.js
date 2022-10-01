const AWS = require('aws-sdk');
const ses = new AWS.SESV2({apiVersion: '2019-09-27'});
const sesV1 = new AWS.SES({apiVersion: '2019-09-27'});

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
 * The result is a list of data points, representing the last two weeks of sending activity.
 * @returns {Promise<{rejects, complaints, bounces, deliveryAttempts}|{rejects: number, complaints: number, bounces: number, deliveryAttempts: number}>}
 */
const getSendStatistics = async () => {
  const sendStatistics = await sesV1.getSendStatistics().promise();
  const defaultRates = {bounces: 0, complaints: 0, rejects: 0, deliveryAttempts: 0};

  const daily = {};
  const weekly = Object.assign({}, defaultRates);
  sendStatistics.SendDataPoints
    .sort((p, n) => n.Timestamp - p.Timestamp)
    .map((item) => {
      const date = item.Timestamp.toLocaleDateString();
      if (!daily[date]) daily[date] =  Object.assign({}, defaultRates);
      daily[date] = {
        bounces: daily[date].bounces +  item.Bounces,
        complaints: daily[date].complaints + item.Complaints,
        rejects: daily[date].rejects + item.Rejects,
        deliveryAttempts:  daily[date].deliveryAttempts + item.DeliveryAttempts,
      };

      weekly.bounces += item.Bounces;
      weekly.complaints += item.Complaints;
      weekly.deliveryAttempts +=  item.DeliveryAttempts;
    });

  const formatted = Object.keys(daily).map( (key, value) => {
    const rates = {};
    Object.keys(daily[key])
      .map(k => (Object.assign(rates, { [k] : `${((daily[key][k]/ daily[key].deliveryAttempts) * 100).toFixed(2)}%` })));

    return {
      date: key,
      ...rates,
      deliveryAttempts: daily[key].deliveryAttempts,
    };
  });

  return {
    daily: formatted,
    weekly: {
      bounces: ((weekly.bounces / weekly.deliveryAttempts) * 100).toFixed(2) + '%',
      complaints: ((weekly.complaints / weekly.deliveryAttempts) * 100).toFixed(2) + '%',
      rejects: ((weekly.rejects / weekly.deliveryAttempts) * 100).toFixed(2) + '%',
      deliveryAttempts: weekly.deliveryAttempts
    }
  };

};

/**
 * Get account quotes
 */
const getQuotes = async () => {
  let result = {};

  try {
    const quotes = await ses.getAccount().promise();
    const {EnforcementStatus, ProductionAccessEnabled} = quotes;
    const {Max24HourSend, SentLast24Hours, MaxSendRate} = quotes.SendQuota;
    const {daily, weekly} = await getSendStatistics();

    result = {
      status: `AWS SES is ${EnforcementStatus.toLowerCase()}`,
      productionAccess: `Production access is ${ProductionAccessEnabled ? 'enabled' : 'disabled'}`,
      max24HourSend: `You have ${Max24HourSend} emails limit for last 24 hours.`,
      sentLast24Hours: `You already send ${SentLast24Hours} emails for last 24 hours.`,
      maxSendRate: `The maximum number of emails that you can send per second is ${MaxSendRate}.`,
      sendDailyRates: daily,
      sendWeeklyRates: weekly
    };
  } catch (e) {
    console.log(`Could not fetch SES account quotes. ${JSON.stringify(e.message)}`);
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

export const sendNotificationHandler = async(event) => {
  console.log(JSON.stringify(event));

  const data = JSON.parse(event.Records[0].Sns.Message);
  await ses.sendEmail({
    FromEmailAddress:  process.env.SENDER,
    Destination: {
      ToAddresses: [ process.env.DESTINATION ]
    },
    Content: {
      Simple: {
        Subject: {
          Charset: 'UTF-8',
          Data: data.AlarmName,
        },
        Body: {
          Text: {
            Data: data.AlarmDescription,
            Charset: 'UTF-8',
          },
        }
      }
    }
  }).promise();

  return {
    statusCode: 200,
    body: null,
  };
};

/**
 * Handler for viewing quotes information
 */
exports.handler = async () => {
  const quotes = await getQuotes();
  let headers = {"Content-Type": "application/json"};

  return {
    statusCode: 200,
    body: JSON.stringify(quotes),
    headers
  };
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

  return {
    ...result,
    headers: {
      "Content-Type": "application/json"
    }
  }
};
