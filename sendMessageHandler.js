const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {
  const senderConnectionId = event.requestContext.connectionId;

  // Get channelID for sender from connections table
  let channelID;
  try {
    const result = await ddb
      .get({
        TableName: process.env.table,
        Key: {
          connectionId: senderConnectionId,
        },
      })
      .promise();
    channelID = result.Item.channelID;
  } catch (err) {
    console.log(err);
    return { statusCode: 500 };
  }
  

  // Scan connections table for connections with the same channelID as the sender
  let connections;
  try {
    connections = await ddb
      .scan({
        TableName: process.env.table,
        IndexName: 'channelID-index',
        FilterExpression: 'channelID = :channelID',
        ExpressionAttributeValues: {
          ':channelID': channelID,
        },
      })
      .promise();
  } catch (err) {
    console.log(err);
    return { statusCode: 500 };
  }

  // Create ApiGatewayManagementApi object for sending messages
  const callbackAPI = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage,
  });
  
  const message = JSON.parse(event.body).message;

  // Send message to each connection with the same channelID as the sender
  const sendMessages = connections.Items.map(async ({ connectionId }) => {
    if (connectionId !== senderConnectionId) {
      try {
        await callbackAPI
          .postToConnection({ ConnectionId: connectionId, Data: message })
          .promise();
      } catch (e) {
        console.log(e);
      }
    }
  });

  try {
    await Promise.all(sendMessages);
  } catch (e) {
    console.log(e);
    return { statusCode: 500 };
  }

  return { statusCode: 200 };
};


