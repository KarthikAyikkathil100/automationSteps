const responses = require('@Helpers/responses');

const { getCloudStorageClient, getVideoIntelligenceClient } = require('@Helpers/index.js')



const handler = async (event, context, callback) => {
    try {
        const reqBody = JSON.parse(event.body);
        const jobId = reqBody.job_id
        const status = await checkStatus(jobId)
        console.log('Status of Job => ', status)
        return responses.successResponseData(callback, {
            status
        })
    } catch (e) { 
        console.log('Error while checking job status')
        return responses.errorResponseWithoutData(
            callback,
            messages.INTERNAL_SERVER_ERROR
          );
    }
    
}


async function checkStatus(jobId) {
    return new Promise(async (resolve, reject) => {
        try {
            const client = await getVideoIntelligenceClient('/automation/google/creds')
            const [operation] = await client.operationsClient.getOperation({name: jobId.id})
            if (operation?.done === true) {
                // push this to the in-progress arr
                // inProgressJobData.push(jobId)
                // waitingJobData = waitingJobData.filter((el) => el.id !== jobId.id)
                return resolve(true)
            }
            return resolve(false)
        } catch (e) {
            console.log('error here -- ', e)
            reject(e)
        }
    })
}


exports.handler = handler;