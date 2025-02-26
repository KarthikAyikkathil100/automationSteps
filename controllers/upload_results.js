const responses = require('@Helpers/responses');
const { uploadFile } = require('@AwsHelpers/S3/index.js')
const { dynamoConnection } = require('@AwsHelpers/DynamoDB/index.js')
const { getCloudStorageClient, getVideoIntelligenceClient } = require('@Helpers/index.js')
const fs = require('fs');
// TODO: Delte the file from local system
const handler = async (event, context, callback) => {
    let storePath = null
    try {
        const reqBody = event;
        const routeId = reqBody.route_id
        const query = {
            TableName: 'dev-Routes',
            Key: {
              id: routeId,
            },
            ProjectionExpression: 'id, videoURL'
        }

        const routeDataRaw = await dynamoConnection.get(query).promise()
        if (!routeDataRaw || !routeDataRaw?.Item || Object.keys(routeDataRaw?.Item) === 0) {
            return responses.errorResponseWithoutData(
                callback,
                'Route data not found',
                0,
                404
            );    
        }

        const videoUrl = routeDataRaw?.Item?.videoURL;
        if (!videoUrl) {
            return responses.errorResponseWithoutData(
                callback,
                'Video URL not found',
                0,
                404
            );    
        }
        const splits = videoUrl.split('/')
        const fileName = splits[splits.length - 1]
        storePath = `${fileName}.json`
        await processResults(storePath)
        const updatedParams = {
            TableName: 'dev-Routes',
            Key: {
              id: routeId,
            },
            UpdateExpression: 'set #textBlurJsonFileNameCol = :val',
            ExpressionAttributeNames: {
                '#textBlurJsonFileNameCol': 'textBlurJsonFileName',
            },
            ExpressionAttributeValues: {
                ':val': `textBlurFile/${fileName}.json`
            },
        };
        await dynamoConnection.update(updatedParams).promise();

        return callback(null, {
            route_id: routeId
        })
    } catch (e) { 
        console.log('Error while checking job status')
        console.log(e)
        return responses.errorResponseWithoutData(
            callback,
            'INTERNAL_SERVER_ERROR',
            0,
            500
          );
    } finally {
        // Remove file from ephermal storage
        if (storePath !== null && fs.existsSync(`/tmp/${storePath}`)) {
            fs.unlinkSync(`/tmp/${storePath}`);
            console.log(`Removed the file /tmp/${storePath}`);
        } else {
            console.log(`Sorry, file ${storePath} does not exist.`);
        }
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

async function processResults(fileName) {
    try {
        await downloadFileFromGCS('rtme-videos', fileName, `/tmp/${fileName}`)
        console.log('Downloaded the file to be processed')

        let convertDSObj = convertDS(`/tmp/${fileName}`)
        if (!convertDSObj) convertDSObj = {}
        await uploadFile(Buffer.from(JSON.stringify(convertDSObj)), 'media.demo.test', `textBlurFile/${fileName}`, 'application/json')

        // Save the text json file's name in Dynamo DB
        return true
    } catch (e) {
        console.log('Error while processing results')
        console.log(e)
        throw e;
    }
}

function convertDS(filePath) {
    try {
        const allTimeRes = {}
        const rawData = require(filePath)
        if (!rawData || !rawData?.annotation_results || !rawData.annotation_results.length > 0)
            throw 'Error in raw data'
        
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
                            allTimeRes[time] = [vertices]
                        }
                    }
                }
            }
        }
        return allTimeRes
    } catch (e) {
        console.log('Error while converting DS')
        console.log(e)
        throw e
    }
}


exports.handler = handler;