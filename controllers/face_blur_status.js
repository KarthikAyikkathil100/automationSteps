const responses = require('@Helpers/responses');

const { getCloudStorageClient, getVideoIntelligenceClient } = require('@Helpers/index.js')
const { dynamoConnection } = require('@AwsHelpers/DynamoDB/index.js')


const handler = async (event, context, callback) => {
    try {
        const route_id = event.route_id
        const status = await checkStatus(route_id)
        let done = false, error = false;
        if (status === 'FACE_BLUR_SUCCESS') {
            done = true
        } else if (status === 'FACE_BLUR_ERROR') {
            error = true
        }
        console.log('Status of Job => ', status)
        return callback(null, {
            route_id,
            done,
            error
        })
    } catch (e) { 
        console.log('Error while checking job status')
        console.log(e)
        return callback(e, {
            route_id,
            done,
            error
        })
    }
}

async function checkStatus(routeId) {
    try {
        const routeParams = {
            TableName: 'dev-Routes',
            Key: {
              id: routeId,
            },
            ProjectionExpression: 'id, processStatus',
        };
        const routeData = await dynamoConnection.get(routeParams).promise();
        if (!routeData?.Item || Object.keys(routeData?.Item).length === 0) {
            throw new Error('Route not found');
        }
        return routeData.Item?.processStatus ?? null
    } catch (e) {
        console.log('Error while fetching blur status from DynamoDB')
        throw e
    }
}


exports.handler = handler;