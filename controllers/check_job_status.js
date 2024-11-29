const responses = require('@Helpers/responses');
const { uploadFile } = require('@AwsHelpers/S3/index.js')
const { getCloudStorageClient, getVideoIntelligenceClient } = require('@Helpers/index.js')



const handler = async (event, context, callback) => {
    try {
        const reqBody = event;
        const jobId = reqBody.job_id
        const fileName = reqBody.file_name
        const status = await checkStatus(jobId)
        if (status) {
            await processResults(fileName)
            let convertDSObj = convertDS(`/tmp/${fileName}`)
            if (!convertDSObj) convertDSObj = {}
            await uploadFile(Buffer.from(JSON.stringify(convertDSObj)), 'media.demo.test', fileName, 'application/json')
            console.log(convertDSObj)
        }
        console.log('Status of Job => ', status)
        return responses.successResponseData(callback, {
            status
        })
    } catch (e) { 
        console.log('Error while checking job status')
        console.log(e)
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
            const [operation] = await client.operationsClient.getOperation({name: jobId})
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


async function processResults(fileName) {
    try {
        await downloadFileFromGCS('rtme-videos', fileName, `/tmp/${fileName}`)
        console.log('Downloaded the file to be processed')
        return true
    } catch (e) {
        console.log('Error while processing results')
        console.log(e)
        return null
    }
}

async function downloadFileFromGCS(bucketName, fileName, destFileName) {
    try {
        const options = {
            destination: destFileName,
        };
        const storage = await getCloudStorageClient('/automation/google/creds')
        // Downloads the file and store it locally (configured in 'options')
        await storage.bucket(bucketName).file(fileName).download(options)
    } catch (e) {
        throw e;
    }
}



function convertDS(filePath) {
    try {
        const allTimeRes = {}
        const rawData = require(filePath)
        if (!rawData || !rawData?.annotation_results || !rawData.annotation_results.length > 0)
            throw 'Error in raw data'
        
        console.log('correct block')
        const annotation_results = rawData?.annotation_results ?? []
        for (let i = 0; i < annotation_results.length; i++) {
            const annotation_result_instance = annotation_results[i];
            // console.log('annotation_result_instance => ', annotation_result_instance)
            const textAnnotaions = annotation_result_instance?.text_annotations ?? []
            for (let j = 0; j < textAnnotaions.length; j++) {
                const txtAnnInstance = textAnnotaions[j]
                const segments = txtAnnInstance?.segments ?? []
                for (let k = 0; k < segments.length; k++) {
                    const segInstance = segments[k]
                    const frames = segInstance?.frames ?? [];
                    for (let h = 0; h < frames.length; h++) {
                        const frameInst = frames[h]
                        const vertices = frameInst?.rotated_bounding_box?.vertices ?? []
                        const time = frameInst?.time_offset?.seconds ?? 0
                        if (allTimeRes[time]) {
                            (allTimeRes[time]).push(vertices)
                        } else {
                            console.log('creating for t => ', time)
                            allTimeRes[time] = [vertices]
                        }
                    }
                }
            }
        }
        return allTimeRes
    } catch (e) {
        console.log(e)
        console.log('Error while converting DS')
    }
}

exports.handler = handler;