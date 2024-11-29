const responses = require('@Helpers/responses.js');
// const { axios } = requie('@Helpers/index.js')
const axios = require('axios')

const handler = async (event, context, callback) => {
  console.log('event => ', event);
  try {
    const records = event.Records ?? [];
    const failedRecords = [];
    const allPromises = []
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
        const reqBody = JSON.parse(record.body);
        console.log(reqBody)
        allPromises.push(axios.get('http://test-lb-2031587651.us-east-1.elb.amazonaws.com/test/v1'))
    }
    const allRes = await Promise.allSettled(allPromises);
    for (let i = 0; i < allRes.length; i++) {
      const el = allRes[i]
      if (el.status === 'rejected') {
        failedRecords.push({
          itemIdentifier: records[i].messageId,
        });
      }
    }
    return responses.successResponseData(callback, {
      batchItemFailures: failedRecords,
    });
  } catch (e) {
    console.log(e);
    return responses.errorResponseWithoutData(
      callback,
      messages.INTERNAL_SERVER_ERROR
    );
  }
};

exports.handler = handler;
